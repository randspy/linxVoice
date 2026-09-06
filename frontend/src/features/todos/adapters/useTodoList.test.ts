import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Todo } from '../domain/todo'
import type { TanstackTodoRepository } from './tanstackTodoRepository'
import { useTodoList } from './useTodoList'

const tanstack = vi.hoisted(() => ({
  eq: vi.fn((value: boolean, expected: boolean) => value === expected),
  useLiveQuery: vi.fn(),
}))

vi.mock('@tanstack/react-db', () => ({
  eq: tanstack.eq,
  useLiveQuery: tanstack.useLiveQuery,
}))

describe('Todo live-query adapter', () => {
  beforeEach(() => {
    tanstack.eq.mockClear()
    tanstack.useLiveQuery.mockImplementation(
      ({ query }: { query: (builder: ReturnType<typeof queryBuilder>) => unknown }) => {
        query(queryBuilder())
        return { data: [], isLoading: false, isError: false }
      },
    )
  })

  it.each([
    ['active', false],
    ['completed', true],
  ] as const)('maps the %s filter to the synchronized completion field', (filter, completed) => {
    renderHook(() => useTodoList(repository(), filter))

    expect(tanstack.eq).toHaveBeenCalledWith(true, completed)
  })

  it('leaves the all query unfiltered', () => {
    renderHook(() => useTodoList(repository(), 'all'))

    expect(tanstack.eq).not.toHaveBeenCalled()
  })
})

function queryBuilder() {
  const todo = todoFactory()
  const chain = {
    where: vi.fn((predicate: (row: { todo: Todo }) => unknown) => {
      predicate({ todo })
      return chain
    }),
    orderBy: vi.fn((selector: (row: { todo: Todo }) => unknown) => {
      selector({ todo })
      return chain
    }),
  }
  return { from: vi.fn(() => chain) }
}

function repository() {
  return { collection: { name: 'todos' } } as unknown as TanstackTodoRepository
}

function todoFactory(): Todo {
  return {
    id: 'todo-id',
    title: 'Original title',
    completed: true,
    created_at: '2026-08-23T12:00:00Z',
    updated_at: '2026-08-23T12:00:00Z',
    version: 2,
  }
}
