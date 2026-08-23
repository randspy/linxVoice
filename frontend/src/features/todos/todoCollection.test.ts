import { TimeoutWaitingForTxIdError } from '@tanstack/electric-db-collection'
import type { DbClient } from '@tanstack/react-db'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createTodo,
  persistDelete,
  persistInsert,
  persistUpdate,
  removeTodo,
  todoSchema,
  todoShapeUrl,
  type Todo,
  updateTodo,
} from './todoCollection'
import { mutationStatus } from './todoMutationStatus'

const sdk = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}))

vi.mock('../../api/generated/sdk.gen', () => ({
  postApiV1Todos: sdk.create,
  patchApiV1TodosByTodoId: sdk.update,
  deleteApiV1TodosByTodoId: sdk.remove,
}))

describe('Todo optimistic commands', () => {
  beforeEach(() => {
    mutationStatus.reset()
    sdk.create.mockResolvedValue({ data: { txid: 41 } })
    sdk.update.mockResolvedValue({ data: { txid: 42 } })
    sdk.remove.mockResolvedValue({ data: { txid: 43 } })
  })

  it('inserts a complete optimistic Todo and waits for persistence', async () => {
    const { client, collection } = clientFixture()

    await createTodo(client, '  Trace the signal  ')

    expect(collection.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        title: 'Trace the signal',
        completed: false,
        version: 1,
      }),
    )
    expect(mutationStatus.getSnapshot().pendingIds.size).toBe(0)
  })

  it('applies only requested fields to an optimistic update', async () => {
    const { client, collection } = clientFixture()
    const todo = todoFactory()

    await updateTodo(client, todo, { title: '  Renamed  ' })

    const updater = collection.update.mock.calls[0]?.[1]
    expect(updater).toBeDefined()
    const draft = { ...todo }
    updater?.(draft)
    expect(draft).toEqual({ ...todo, title: 'Renamed' })
  })

  it('deletes by stable Todo identity', async () => {
    const { client, collection } = clientFixture()
    const todo = todoFactory()

    await removeTodo(client, todo)

    expect(collection.delete).toHaveBeenCalledWith(todo.id)
  })

  it('rejects malformed synchronized rows', () => {
    expect(() => todoSchema.parse({ ...todoFactory(), version: 0 })).toThrow()
    expect(() => todoSchema.parse({ ...todoFactory(), created_at: 'not-a-timestamp' })).toThrow()
  })

  it('accepts PostgreSQL timestamps emitted by Electric', () => {
    expect(
      todoSchema.parse({
        ...todoFactory(),
        created_at: '2026-08-23 17:15:00.123456+00',
        updated_at: '2026-08-23 17:15:00.123456+00',
      }),
    ).toBeDefined()
  })

  it('builds an absolute same-origin Electric proxy URL', () => {
    expect(todoShapeUrl('http://localhost:5173')).toBe('http://localhost:5173/api/v1/sync/todos')
  })

  it('persists collection inserts through the generated command', async () => {
    const todo = todoFactory()

    const match = await persistInsert({
      transaction: { mutations: [{ modified: todo }] },
    } as never)

    expect(sdk.create).toHaveBeenCalledWith({ body: { id: todo.id, title: todo.title } })
    expect(match).toEqual({ txid: 41, timeout: 10_000 })
  })

  it('persists only changed collection fields with the synchronized version', async () => {
    const todo = todoFactory()

    const match = await persistUpdate({
      transaction: { mutations: [{ original: todo, changes: { completed: true } }] },
    } as never)

    expect(sdk.update).toHaveBeenCalledWith({
      path: { todo_id: todo.id },
      headers: { 'If-Match': '"2"' },
      body: { completed: true },
    })
    expect(match).toEqual({ txid: 42, timeout: 10_000 })
  })

  it('persists a title-only collection change', async () => {
    const todo = todoFactory()

    await persistUpdate({
      transaction: { mutations: [{ original: todo, changes: { title: 'New title' } }] },
    } as never)

    expect(sdk.update).toHaveBeenCalledWith(
      expect.objectContaining({ body: { title: 'New title' } }),
    )
  })

  it('persists collection deletes with a version precondition', async () => {
    const todo = todoFactory()

    const match = await persistDelete({
      transaction: { mutations: [{ original: todo }] },
    } as never)

    expect(sdk.remove).toHaveBeenCalledWith({
      path: { todo_id: todo.id },
      headers: { 'If-Match': '"2"' },
    })
    expect(match).toEqual({ txid: 43, timeout: 10_000 })
  })

  it('marks synchronization delayed and reloads after confirmation timeout', async () => {
    const timeout = new TimeoutWaitingForTxIdError(44, 'todos')
    const { client, collection } = clientFixture(Promise.reject(timeout))

    await expect(createTodo(client, 'Delayed')).resolves.toBeUndefined()

    expect(collection.cleanup).toHaveBeenCalled()
    expect(collection.preload).toHaveBeenCalled()
    expect(mutationStatus.getSnapshot().confirmationDelayed).toBe(true)
  })

  it('rolls back a definitive error without claiming delayed synchronization', async () => {
    const failure = new Error('Write rejected')
    const { client, collection } = clientFixture(Promise.reject(failure))

    await expect(removeTodo(client, todoFactory())).rejects.toBe(failure)

    expect(collection.cleanup).not.toHaveBeenCalled()
    expect(mutationStatus.getSnapshot().confirmationDelayed).toBe(false)
  })

  it('unlocks a Todo when collection validation rejects synchronously', () => {
    const todo = todoFactory()
    const { client, collection } = clientFixture()
    collection.update.mockImplementationOnce(() => {
      throw new Error('Invalid synchronized row')
    })

    expect(() => updateTodo(client, todo, { completed: true })).toThrow('Invalid synchronized row')
    expect(mutationStatus.getSnapshot().pendingIds).not.toContain(todo.id)
  })

  it('clears a prior delayed status after a later command confirms', async () => {
    mutationStatus.delayed()
    const { client } = clientFixture()

    await createTodo(client, 'Recovered')

    expect(mutationStatus.getSnapshot().confirmationDelayed).toBe(false)
  })

  it('rejects malformed empty collection transactions', async () => {
    await expect(persistInsert({ transaction: { mutations: [] } } as never)).rejects.toThrow(
      'Insert transaction has no Todo',
    )
    await expect(persistUpdate({ transaction: { mutations: [] } } as never)).rejects.toThrow(
      'Update transaction has no Todo',
    )
    await expect(persistDelete({ transaction: { mutations: [] } } as never)).rejects.toThrow(
      'Delete transaction has no Todo',
    )
  })
})

function clientFixture(persisted: Promise<unknown> = Promise.resolve({})) {
  const collection = {
    insert: vi.fn((_todo: Todo) => ({ isPersisted: { promise: persisted } })),
    update: vi.fn((_id: string, _updater: (draft: Todo) => void) => ({
      isPersisted: { promise: persisted },
    })),
    delete: vi.fn((_id: string) => ({ isPersisted: { promise: persisted } })),
    cleanup: vi.fn(),
    preload: vi.fn(),
  }
  const client = { collection: vi.fn(() => collection) } as unknown as DbClient
  return { client, collection }
}

function todoFactory(overrides: Partial<Todo> = {}): Todo {
  return {
    id: '0198d8b6-6535-7a68-a6ec-45bfbe0d4191',
    title: 'Original title',
    completed: false,
    created_at: '2026-08-23T12:00:00Z',
    updated_at: '2026-08-23T12:00:00Z',
    version: 2,
    ...overrides,
  }
}
