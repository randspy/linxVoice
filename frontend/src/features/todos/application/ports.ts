import type { Todo, TodoChanges } from '../domain/todo'

export type TodoMutationOutcome = 'confirmed' | 'confirmation-delayed'

export interface TodoRepository {
  preload(): Promise<void>
  reload(): Promise<void>
  create(todo: Todo): Promise<TodoMutationOutcome>
  update(todo: Todo, changes: TodoChanges): Promise<TodoMutationOutcome>
  remove(todo: Todo): Promise<TodoMutationOutcome>
}

export interface TodoCommands {
  create(title: string): Promise<void>
  rename(todo: Todo, title: string): Promise<void>
  setCompleted(todo: Todo, completed: boolean): Promise<void>
  remove(todo: Todo): Promise<void>
}

export interface TodoMutationTracker {
  begin(id: string): void
  end(id: string): void
  delayed(): void
  confirmed(): void
}
