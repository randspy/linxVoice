import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Todo } from '../domain/todo'
import type { TodoRepository } from './ports'
import { TodoMutationStore } from './todoMutationStore'
import { TodoService } from './todoService'

const repository = {
  preload: vi.fn(() => Promise.resolve()),
  reload: vi.fn(() => Promise.resolve()),
  create: vi.fn<TodoRepository['create']>(() => Promise.resolve('confirmed')),
  update: vi.fn<TodoRepository['update']>(() => Promise.resolve('confirmed')),
  remove: vi.fn<TodoRepository['remove']>(() => Promise.resolve('confirmed')),
} satisfies TodoRepository

describe('Todo application service', () => {
  let mutations: TodoMutationStore
  let service: TodoService

  beforeEach(() => {
    vi.clearAllMocks()
    repository.create.mockResolvedValue('confirmed')
    repository.update.mockResolvedValue('confirmed')
    repository.remove.mockResolvedValue('confirmed')
    repository.reload.mockResolvedValue(undefined)
    mutations = new TodoMutationStore()
    service = new TodoService(
      repository,
      mutations,
      () => 'todo-id',
      () => new Date('2026-08-23T12:00:00Z'),
    )
  })

  it('creates a normalized optimistic Todo through the repository port', async () => {
    await service.create('  Trace the signal  ')

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'todo-id', title: 'Trace the signal', completed: false }),
    )
    expect(mutations.getSnapshot().pendingIds.size).toBe(0)
  })

  it('preloads synchronized data through the repository port', async () => {
    await service.preload()

    expect(repository.preload).toHaveBeenCalled()
  })

  it('expresses rename and completion as explicit use cases', async () => {
    const todo = todoFactory()

    await service.rename(todo, '  Renamed  ')
    await service.setCompleted(todo, true)

    expect(repository.update).toHaveBeenNthCalledWith(1, todo, { title: 'Renamed' })
    expect(repository.update).toHaveBeenNthCalledWith(2, todo, { completed: true })
  })

  it('tracks delayed confirmation without treating it as a failed command', async () => {
    repository.create.mockResolvedValueOnce('confirmation-delayed')

    await expect(service.create('Delayed')).resolves.toBeUndefined()

    expect(mutations.getSnapshot()).toEqual({
      pendingIds: new Set(),
      confirmationDelayed: true,
    })
  })

  it('clears a delayed state after a later command confirms', async () => {
    mutations.delayed()

    await service.remove(todoFactory())

    expect(mutations.getSnapshot().confirmationDelayed).toBe(false)
  })

  it('shows delayed confirmation while recovery is still pending', async () => {
    repository.create.mockResolvedValueOnce('confirmation-delayed')
    let finishRecovery!: () => void
    repository.reload.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishRecovery = resolve
      }),
    )

    const command = service.create('Delayed')
    await vi.waitFor(() => expect(repository.reload).toHaveBeenCalled())

    expect(mutations.getSnapshot().confirmationDelayed).toBe(true)
    expect(mutations.getSnapshot().pendingIds).toContain('todo-id')
    finishRecovery()
    await command
    expect(mutations.getSnapshot().pendingIds.size).toBe(0)
  })

  it('keeps an accepted write successful when sync recovery fails', async () => {
    repository.create.mockResolvedValueOnce('confirmation-delayed')
    repository.reload.mockRejectedValueOnce(new Error('Sync unavailable'))

    await expect(service.create('Saved')).resolves.toBeUndefined()

    expect(repository.reload).toHaveBeenCalled()
    expect(mutations.getSnapshot().confirmationDelayed).toBe(true)
    expect(mutations.getSnapshot().pendingIds.size).toBe(0)
  })

  it('always unlocks a Todo when the repository rejects', async () => {
    repository.update.mockRejectedValueOnce(new Error('Write rejected'))
    const todo = todoFactory()

    await expect(service.setCompleted(todo, true)).rejects.toThrow('Write rejected')

    expect(mutations.getSnapshot().pendingIds).not.toContain(todo.id)
  })

  it('keeps a Todo locked until its repository command settles', async () => {
    let confirm!: (outcome: 'confirmed') => void
    const persistence = new Promise<'confirmed'>((resolve) => {
      confirm = resolve
    })
    repository.update.mockReturnValueOnce(persistence)
    const todo = todoFactory()

    const command = service.setCompleted(todo, true)
    expect(mutations.getSnapshot().pendingIds).toContain(todo.id)

    confirm('confirmed')
    await command
    expect(mutations.getSnapshot().pendingIds).not.toContain(todo.id)
  })
})

function todoFactory(): Todo {
  return {
    id: 'todo-id',
    title: 'Original title',
    completed: false,
    created_at: '2026-08-23T12:00:00Z',
    updated_at: '2026-08-23T12:00:00Z',
    version: 2,
  }
}
