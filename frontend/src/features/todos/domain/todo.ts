export const TODO_TITLE_MAX_LENGTH = 200

export type Todo = Readonly<{
  id: string
  title: string
  completed: boolean
  created_at: string
  updated_at: string
  version: number
}>

export type TodoFilter = 'all' | 'active' | 'completed'

export type TodoChanges = Partial<Pick<Todo, 'title' | 'completed'>>

export class InvalidTodoTitleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidTodoTitleError'
  }
}

export function normalizeTodoTitle(value: string) {
  const title = value.trim()
  if (title.length === 0) throw new InvalidTodoTitleError('A Todo title is required.')
  if (title.length > TODO_TITLE_MAX_LENGTH) {
    throw new InvalidTodoTitleError(
      `A Todo title cannot exceed ${TODO_TITLE_MAX_LENGTH} characters.`,
    )
  }
  return title
}

export function createTodoDraft(id: string, title: string, now: Date): Todo {
  const timestamp = now.toISOString()
  return {
    id,
    title: normalizeTodoTitle(title),
    completed: false,
    created_at: timestamp,
    updated_at: timestamp,
    version: 1,
  }
}
