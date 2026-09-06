import type { DbClient } from '@tanstack/react-db'
import { describe, expect, it } from 'vitest'

import { TanstackTodoRepository } from '../adapters/tanstackTodoRepository'
import { TodoMutationStore } from '../application/todoMutationStore'
import { TodoService } from '../application/todoService'
import { getTodoComposition } from './todoComposition'

describe('Todo composition root', () => {
  it('constructs one dependency graph per TanStack DB client', () => {
    const client = {} as DbClient

    const first = getTodoComposition(client)
    const second = getTodoComposition(client)
    const other = getTodoComposition({} as DbClient)

    expect(first).toBe(second)
    expect(other).not.toBe(first)
    expect(first.repository).toBeInstanceOf(TanstackTodoRepository)
    expect(first.mutationStore).toBeInstanceOf(TodoMutationStore)
    expect(first.service).toBeInstanceOf(TodoService)
  })
})
