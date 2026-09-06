import { createTodoDraft, normalizeTodoTitle, type Todo } from '../domain/todo'
import type {
  TodoCommands,
  TodoMutationOutcome,
  TodoMutationTracker,
  TodoRepository,
} from './ports'

export class TodoService implements TodoCommands {
  constructor(
    private readonly repository: TodoRepository,
    private readonly mutations: TodoMutationTracker,
    private readonly nextId: () => string,
    private readonly now: () => Date,
  ) {}

  preload() {
    return this.repository.preload()
  }

  create(title: string) {
    const todo = createTodoDraft(this.nextId(), title, this.now())
    return this.execute(todo.id, () => this.repository.create(todo))
  }

  rename(todo: Todo, title: string) {
    const normalizedTitle = normalizeTodoTitle(title)
    return this.execute(todo.id, () => this.repository.update(todo, { title: normalizedTitle }))
  }

  setCompleted(todo: Todo, completed: boolean) {
    return this.execute(todo.id, () => this.repository.update(todo, { completed }))
  }

  remove(todo: Todo) {
    return this.execute(todo.id, () => this.repository.remove(todo))
  }

  private async execute(id: string, command: () => Promise<TodoMutationOutcome>) {
    this.mutations.begin(id)
    try {
      const outcome = await command()
      if (outcome === 'confirmation-delayed') {
        this.mutations.delayed()
        try {
          await this.repository.reload()
        } catch {
          // Recovery failure cannot undo an accepted write. Keep the delayed status visible.
        }
      } else {
        this.mutations.confirmed()
      }
    } finally {
      this.mutations.end(id)
    }
  }
}
