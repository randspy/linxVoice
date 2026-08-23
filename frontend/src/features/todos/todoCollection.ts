import {
  electricCollectionOptions,
  type ElectricCollectionConfig,
  TimeoutWaitingForTxIdError,
} from '@tanstack/electric-db-collection'
import { collectionOptions, type DbClient } from '@tanstack/react-db'
import { z } from 'zod'

import { unwrap } from '../../api/client'
import {
  deleteApiV1TodosByTodoId,
  patchApiV1TodosByTodoId,
  postApiV1Todos,
} from '../../api/generated/sdk.gen'
import { zTodoMutationResponseTodoRead } from '../../api/generated/zod.gen'
import { mutationStatus } from './todoMutationStatus'

const synchronizedTimestamp = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'Invalid timestamp',
})

export const todoSchema = zTodoMutationResponseTodoRead.extend({
  title: z.string().trim().min(1).max(200),
  created_at: synchronizedTimestamp,
  updated_at: synchronizedTimestamp,
  version: z.int().min(1),
})

export type Todo = z.infer<typeof todoSchema>
type CollectionConfig = ElectricCollectionConfig<Todo, typeof todoSchema>
type InsertParams = Parameters<NonNullable<CollectionConfig['onInsert']>>[0]
type UpdateParams = Parameters<NonNullable<CollectionConfig['onUpdate']>>[0]
type DeleteParams = Parameters<NonNullable<CollectionConfig['onDelete']>>[0]

const SYNC_TIMEOUT_MS = 10_000

export function createTodoCollectionConfig() {
  return electricCollectionOptions({
    id: 'todos',
    schema: todoSchema,
    getKey: (todo) => todo.id,
    shapeOptions: {
      url: todoShapeUrl(),
    },
    onInsert: persistInsert,
    onUpdate: persistUpdate,
    onDelete: persistDelete,
  })
}

export function todoShapeUrl(origin = window.location.origin) {
  return new URL('/api/v1/sync/todos', origin).toString()
}

export async function persistInsert({ transaction }: InsertParams) {
  const todo = transaction.mutations[0]?.modified
  if (!todo) throw new Error('Insert transaction has no Todo')
  const result = unwrap(await postApiV1Todos({ body: { id: todo.id, title: todo.title } }))
  return { txid: result.txid, timeout: SYNC_TIMEOUT_MS }
}

export async function persistUpdate({ transaction }: UpdateParams) {
  const mutation = transaction.mutations[0]
  if (!mutation) throw new Error('Update transaction has no Todo')
  const result = unwrap(
    await patchApiV1TodosByTodoId({
      path: { todo_id: mutation.original.id },
      headers: { 'If-Match': `"${mutation.original.version}"` },
      body: {
        ...(mutation.changes.title === undefined ? {} : { title: mutation.changes.title }),
        ...(mutation.changes.completed === undefined
          ? {}
          : { completed: mutation.changes.completed }),
      },
    }),
  )
  return { txid: result.txid, timeout: SYNC_TIMEOUT_MS }
}

export async function persistDelete({ transaction }: DeleteParams) {
  const todo = transaction.mutations[0]?.original
  if (!todo) throw new Error('Delete transaction has no Todo')
  const result = unwrap(
    await deleteApiV1TodosByTodoId({
      path: { todo_id: todo.id },
      headers: { 'If-Match': `"${todo.version}"` },
    }),
  )
  return { txid: result.txid, timeout: SYNC_TIMEOUT_MS }
}

export const todoCollectionOptions = collectionOptions('todos', createTodoCollectionConfig)

export function getTodoCollection(client: DbClient) {
  return client.collection(todoCollectionOptions)
}

export function createTodo(client: DbClient, title: string) {
  const collection = getTodoCollection(client)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  mutationStatus.begin(id)
  try {
    const transaction = collection.insert({
      id,
      title: title.trim(),
      completed: false,
      created_at: now,
      updated_at: now,
      version: 1,
    })
    return observeTransaction(client, id, transaction.isPersisted.promise)
  } catch (error) {
    mutationStatus.end(id)
    throw error
  }
}

export function updateTodo(
  client: DbClient,
  todo: Todo,
  changes: Partial<Pick<Todo, 'title' | 'completed'>>,
) {
  mutationStatus.begin(todo.id)
  try {
    const transaction = getTodoCollection(client).update(todo.id, (draft) => {
      if (changes.title !== undefined) draft.title = changes.title.trim()
      if (changes.completed !== undefined) draft.completed = changes.completed
    })
    return observeTransaction(client, todo.id, transaction.isPersisted.promise)
  } catch (error) {
    mutationStatus.end(todo.id)
    throw error
  }
}

export function removeTodo(client: DbClient, todo: Todo) {
  mutationStatus.begin(todo.id)
  try {
    const transaction = getTodoCollection(client).delete(todo.id)
    return observeTransaction(client, todo.id, transaction.isPersisted.promise)
  } catch (error) {
    mutationStatus.end(todo.id)
    throw error
  }
}

async function observeTransaction(client: DbClient, id: string, persistence: Promise<unknown>) {
  try {
    await persistence
    mutationStatus.confirmed()
  } catch (error) {
    if (error instanceof TimeoutWaitingForTxIdError) {
      mutationStatus.delayed()
      const collection = getTodoCollection(client)
      await collection.cleanup()
      await collection.preload()
      return
    }
    throw error
  } finally {
    mutationStatus.end(id)
  }
}
