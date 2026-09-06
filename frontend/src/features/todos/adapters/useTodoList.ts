import { eq, useLiveQuery } from '@tanstack/react-db'

import type { TodoFilter } from '../domain/todo'
import type { TanstackTodoRepository } from './tanstackTodoRepository'

export function useTodoList(repository: TanstackTodoRepository, filter: TodoFilter) {
  return useLiveQuery({
    query: (builder) => {
      const todos = builder.from({ todo: repository.collection })
      const filtered =
        filter === 'active'
          ? todos.where(({ todo }) => eq(todo.completed, false))
          : filter === 'completed'
            ? todos.where(({ todo }) => eq(todo.completed, true))
            : todos
      return filtered
        .orderBy(({ todo }) => todo.created_at, 'asc')
        .orderBy(({ todo }) => todo.id, 'asc')
    },
  })
}
