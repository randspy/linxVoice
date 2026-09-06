import {
  electricCollectionOptions,
  type ElectricCollectionConfig,
  TimeoutWaitingForTxIdError,
} from '@tanstack/electric-db-collection'
import { collectionOptions, type DbClient } from '@tanstack/react-db'
import { z } from 'zod'

import { ApiError } from '../../../api/client'
import { zTodoMutationResponseTodoRead } from '../../../api/generated/zod.gen'
import type { TodoMutationOutcome, TodoRepository } from '../application/ports'
import { TodoConflictError } from '../application/todoErrors'
import { TODO_TITLE_MAX_LENGTH, type Todo, type TodoChanges } from '../domain/todo'
import type { TodoCommandGateway } from './todoHttpGateway'

const synchronizedTimestamp = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'Invalid timestamp',
})

export const todoSchema = zTodoMutationResponseTodoRead.extend({
  title: z.string().trim().min(1).max(TODO_TITLE_MAX_LENGTH),
  created_at: synchronizedTimestamp,
  updated_at: synchronizedTimestamp,
  version: z.int().min(1),
})

type CollectionConfig = ElectricCollectionConfig<Todo, typeof todoSchema>
type InsertParams = Parameters<NonNullable<CollectionConfig['onInsert']>>[0]
type UpdateParams = Parameters<NonNullable<CollectionConfig['onUpdate']>>[0]
type DeleteParams = Parameters<NonNullable<CollectionConfig['onDelete']>>[0]

const SYNC_TIMEOUT_MS = 10_000

export function todoShapeUrl(origin = window.location.origin) {
  return new URL('/api/v1/sync/todos', origin).toString()
}

export function createTodoCollectionConfig(gateway: TodoCommandGateway) {
  return electricCollectionOptions({
    id: 'todos',
    schema: todoSchema,
    getKey: (todo) => todo.id,
    shapeOptions: { url: todoShapeUrl() },
    onInsert: (params) => persistInsert(gateway, params),
    onUpdate: (params) => persistUpdate(gateway, params),
    onDelete: (params) => persistDelete(gateway, params),
  })
}

function createTodoCollectionOptions(gateway: TodoCommandGateway) {
  return collectionOptions('todos', () => createTodoCollectionConfig(gateway))
}

export async function persistInsert(gateway: TodoCommandGateway, { transaction }: InsertParams) {
  const todo = transaction.mutations[0]?.modified
  if (!todo) throw new Error('Insert transaction has no Todo')
  return { txid: await gateway.create(todo), timeout: SYNC_TIMEOUT_MS }
}

export async function persistUpdate(gateway: TodoCommandGateway, { transaction }: UpdateParams) {
  const mutation = transaction.mutations[0]
  if (!mutation) throw new Error('Update transaction has no Todo')
  return {
    txid: await gateway.update(mutation.original, mutation.changes),
    timeout: SYNC_TIMEOUT_MS,
  }
}

export async function persistDelete(gateway: TodoCommandGateway, { transaction }: DeleteParams) {
  const todo = transaction.mutations[0]?.original
  if (!todo) throw new Error('Delete transaction has no Todo')
  return { txid: await gateway.remove(todo), timeout: SYNC_TIMEOUT_MS }
}

export class TanstackTodoRepository implements TodoRepository {
  private readonly options: ReturnType<typeof createTodoCollectionOptions>

  constructor(
    private readonly client: DbClient,
    gateway: TodoCommandGateway,
  ) {
    this.options = createTodoCollectionOptions(gateway)
  }

  get collection() {
    return this.client.collection(this.options)
  }

  async preload() {
    await this.collection.preload()
  }

  async reload() {
    await this.collection.cleanup()
    await this.collection.preload()
  }

  async create(todo: Todo) {
    const transaction = this.collection.insert(todo)
    return this.observeTransaction(transaction.isPersisted.promise)
  }

  async update(todo: Todo, changes: TodoChanges) {
    const transaction = this.collection.update(todo.id, (draft) => {
      if (changes.title !== undefined) draft.title = changes.title
      if (changes.completed !== undefined) draft.completed = changes.completed
    })
    return this.observeTransaction(transaction.isPersisted.promise)
  }

  async remove(todo: Todo) {
    const transaction = this.collection.delete(todo.id)
    return this.observeTransaction(transaction.isPersisted.promise)
  }

  private async observeTransaction(persistence: Promise<unknown>): Promise<TodoMutationOutcome> {
    try {
      await persistence
      return 'confirmed'
    } catch (error) {
      if (error instanceof TimeoutWaitingForTxIdError) {
        return 'confirmation-delayed'
      }
      if (error instanceof ApiError && error.status === 412) {
        throw new TodoConflictError(error.message)
      }
      throw error
    }
  }
}
