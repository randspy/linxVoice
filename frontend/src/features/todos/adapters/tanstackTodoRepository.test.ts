import { TimeoutWaitingForTxIdError } from '@tanstack/electric-db-collection'
import type { DbClient } from '@tanstack/react-db'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../../api/client'
import { TodoConflictError } from '../application/todoErrors'
import type { Todo } from '../domain/todo'
import {
  persistDelete,
  persistInsert,
  persistUpdate,
  TanstackTodoRepository,
  todoSchema,
  todoShapeUrl,
} from './tanstackTodoRepository'
import type { TodoCommandGateway } from './todoHttpGateway'

const gateway = {
  create: vi.fn(() => Promise.resolve(41)),
  update: vi.fn(() => Promise.resolve(42)),
  remove: vi.fn(() => Promise.resolve(43)),
} satisfies TodoCommandGateway

describe('TanStack Todo repository adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    gateway.create.mockResolvedValue(41)
    gateway.update.mockResolvedValue(42)
    gateway.remove.mockResolvedValue(43)
  })

  it('rejects malformed synchronized rows at the data boundary', () => {
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

  it('adapts collection transactions to command gateway calls', async () => {
    const todo = todoFactory()

    await expect(
      persistInsert(gateway, { transaction: { mutations: [{ modified: todo }] } } as never),
    ).resolves.toEqual({ txid: 41, timeout: 10_000 })
    await expect(
      persistUpdate(gateway, {
        transaction: { mutations: [{ original: todo, changes: { completed: true } }] },
      } as never),
    ).resolves.toEqual({ txid: 42, timeout: 10_000 })
    await expect(
      persistDelete(gateway, { transaction: { mutations: [{ original: todo }] } } as never),
    ).resolves.toEqual({ txid: 43, timeout: 10_000 })

    expect(gateway.create).toHaveBeenCalledWith(todo)
    expect(gateway.update).toHaveBeenCalledWith(todo, { completed: true })
    expect(gateway.remove).toHaveBeenCalledWith(todo)
  })

  it('applies optimistic writes through the collection', async () => {
    const { client, collection } = clientFixture()
    const repository = new TanstackTodoRepository(client, gateway)
    const todo = todoFactory()

    await repository.create(todo)
    await repository.update(todo, { title: 'Renamed' })
    await repository.remove(todo)

    expect(collection.insert).toHaveBeenCalledWith(todo)
    const updater = collection.update.mock.calls[0]?.[1]
    const draft = { ...todo }
    updater?.(draft)
    expect(draft.title).toBe('Renamed')
    expect(collection.delete).toHaveBeenCalledWith(todo.id)
  })

  it('preloads the collection through the repository port', async () => {
    const { client, collection } = clientFixture()
    const repository = new TanstackTodoRepository(client, gateway)

    await repository.preload()

    expect(collection.preload).toHaveBeenCalled()
  })

  it('reports delayed confirmation without waiting for sync recovery', async () => {
    const timeout = new TimeoutWaitingForTxIdError(44, 'todos')
    const { client, collection } = clientFixture(Promise.reject(timeout))
    const repository = new TanstackTodoRepository(client, gateway)
    collection.cleanup.mockRejectedValueOnce(new Error('Sync unavailable'))

    await expect(repository.create(todoFactory())).resolves.toBe('confirmation-delayed')

    expect(collection.cleanup).not.toHaveBeenCalled()
  })

  it('reloads synchronized data when recovery is requested', async () => {
    const { client, collection } = clientFixture()
    const repository = new TanstackTodoRepository(client, gateway)

    await repository.reload()

    expect(collection.cleanup).toHaveBeenCalled()
    expect(collection.preload).toHaveBeenCalled()
  })

  it('translates HTTP precondition failures into an application error', async () => {
    const failure = new ApiError('The Todo changed since it was synchronized.', { status: 412 })
    const { client } = clientFixture(Promise.reject(failure))
    const repository = new TanstackTodoRepository(client, gateway)

    await expect(repository.update(todoFactory(), { title: 'Stale draft' })).rejects.toBeInstanceOf(
      TodoConflictError,
    )
  })

  it('passes definitive non-conflict failures through unchanged', async () => {
    const failure = new Error('Write rejected')
    const { client } = clientFixture(Promise.reject(failure))
    const repository = new TanstackTodoRepository(client, gateway)

    await expect(repository.remove(todoFactory())).rejects.toBe(failure)
  })

  it('rejects malformed empty collection transactions', async () => {
    await expect(
      persistInsert(gateway, { transaction: { mutations: [] } } as never),
    ).rejects.toThrow('Insert transaction has no Todo')
    await expect(
      persistUpdate(gateway, { transaction: { mutations: [] } } as never),
    ).rejects.toThrow('Update transaction has no Todo')
    await expect(
      persistDelete(gateway, { transaction: { mutations: [] } } as never),
    ).rejects.toThrow('Delete transaction has no Todo')
  })
})

function clientFixture(persisted: Promise<unknown> = Promise.resolve({})) {
  const collection = {
    insert: vi.fn((_todo: Todo) => ({ isPersisted: { promise: persisted } })),
    update: vi.fn((_id: string, _updater: (draft: Todo) => void) => ({
      isPersisted: { promise: persisted },
    })),
    delete: vi.fn((_id: string) => ({ isPersisted: { promise: persisted } })),
    cleanup: vi.fn(() => Promise.resolve()),
    preload: vi.fn(() => Promise.resolve()),
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
