import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Todo } from '../domain/todo'
import { HttpTodoCommandGateway } from './todoHttpGateway'

const sdk = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}))

vi.mock('../../../api/generated/sdk.gen', () => ({
  postApiV1Todos: sdk.create,
  patchApiV1TodosByTodoId: sdk.update,
  deleteApiV1TodosByTodoId: sdk.remove,
}))

describe('Todo HTTP gateway', () => {
  const gateway = new HttpTodoCommandGateway()

  beforeEach(() => {
    sdk.create.mockReset().mockResolvedValue({ data: { txid: 41 } })
    sdk.update.mockReset().mockResolvedValue({ data: { txid: 42 } })
    sdk.remove.mockReset().mockResolvedValue({ data: { txid: 43 } })
  })

  it('maps a domain Todo to the generated create command', async () => {
    const todo = todoFactory()

    await expect(gateway.create(todo)).resolves.toBe(41)

    expect(sdk.create).toHaveBeenCalledWith({ body: { id: todo.id, title: todo.title } })
  })

  it('maps changed fields and the synchronized version to an update command', async () => {
    const todo = todoFactory()

    await expect(gateway.update(todo, { completed: true })).resolves.toBe(42)

    expect(sdk.update).toHaveBeenCalledWith({
      path: { todo_id: todo.id },
      headers: { 'If-Match': '"2"' },
      body: { completed: true },
    })
  })

  it('maps stable identity and version to a delete command', async () => {
    const todo = todoFactory()

    await expect(gateway.remove(todo)).resolves.toBe(43)

    expect(sdk.remove).toHaveBeenCalledWith({
      path: { todo_id: todo.id },
      headers: { 'If-Match': '"2"' },
    })
  })
})

function todoFactory(): Todo {
  return {
    id: '0198d8b6-6535-7a68-a6ec-45bfbe0d4191',
    title: 'Original title',
    completed: false,
    created_at: '2026-08-23T12:00:00Z',
    updated_at: '2026-08-23T12:00:00Z',
    version: 2,
  }
}
