import type { DbClient } from '@tanstack/react-db'

import { TodoMutationStore } from '../application/todoMutationStore'
import { TodoService } from '../application/todoService'
import { TanstackTodoRepository } from '../adapters/tanstackTodoRepository'
import { HttpTodoCommandGateway } from '../adapters/todoHttpGateway'

export type TodoComposition = ReturnType<typeof createTodoComposition>

const compositions = new WeakMap<DbClient, TodoComposition>()

export function getTodoComposition(client: DbClient) {
  const existing = compositions.get(client)
  if (existing) return existing

  const composition = createTodoComposition(client)
  compositions.set(client, composition)
  return composition
}

function createTodoComposition(client: DbClient) {
  const gateway = new HttpTodoCommandGateway()
  const repository = new TanstackTodoRepository(client, gateway)
  const mutationStore = new TodoMutationStore()
  const service = new TodoService(
    repository,
    mutationStore,
    () => crypto.randomUUID(),
    () => new Date(),
  )
  return { repository, mutationStore, service }
}
