import { describe, expect, it } from 'vitest'

import {
  createTodoDraft,
  InvalidTodoTitleError,
  normalizeTodoTitle,
  TODO_TITLE_MAX_LENGTH,
} from './todo'

describe('Todo domain model', () => {
  it('normalizes a title at the domain boundary', () => {
    expect(normalizeTodoTitle('  Trace the signal  ')).toBe('Trace the signal')
  })

  it('rejects empty and overlong titles without a UI or schema library', () => {
    expect(() => normalizeTodoTitle('   ')).toThrow(InvalidTodoTitleError)
    expect(() => normalizeTodoTitle('x'.repeat(TODO_TITLE_MAX_LENGTH + 1))).toThrow(
      InvalidTodoTitleError,
    )
  })

  it('creates a complete optimistic draft', () => {
    expect(createTodoDraft('todo-id', ' New Todo ', new Date('2026-08-23T12:00:00Z'))).toEqual({
      id: 'todo-id',
      title: 'New Todo',
      completed: false,
      created_at: '2026-08-23T12:00:00.000Z',
      updated_at: '2026-08-23T12:00:00.000Z',
      version: 1,
    })
  })
})
