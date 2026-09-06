import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TodoMutationStore } from '../application/todoMutationStore'
import { useTodoMutationSnapshot } from './useTodoMutationSnapshot'

describe('Todo mutation React binding', () => {
  it('re-renders when application mutation state changes', () => {
    const store = new TodoMutationStore()
    const { result } = renderHook(() => useTodoMutationSnapshot(store))

    act(() => store.begin('todo-id'))
    expect(result.current.pendingIds).toContain('todo-id')

    act(() => store.end('todo-id'))
    expect(result.current.pendingIds).not.toContain('todo-id')
  })
})
