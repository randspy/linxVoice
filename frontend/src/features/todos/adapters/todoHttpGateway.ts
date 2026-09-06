import { unwrap } from '../../../api/client'
import {
  deleteApiV1TodosByTodoId,
  patchApiV1TodosByTodoId,
  postApiV1Todos,
} from '../../../api/generated/sdk.gen'
import type { Todo, TodoChanges } from '../domain/todo'

export interface TodoCommandGateway {
  create(todo: Todo): Promise<number>
  update(todo: Todo, changes: TodoChanges): Promise<number>
  remove(todo: Todo): Promise<number>
}

export class HttpTodoCommandGateway implements TodoCommandGateway {
  async create(todo: Todo) {
    const result = unwrap(await postApiV1Todos({ body: { id: todo.id, title: todo.title } }))
    return result.txid
  }

  async update(todo: Todo, changes: TodoChanges) {
    const result = unwrap(
      await patchApiV1TodosByTodoId({
        path: { todo_id: todo.id },
        headers: { 'If-Match': `"${todo.version}"` },
        body: {
          ...(changes.title === undefined ? {} : { title: changes.title }),
          ...(changes.completed === undefined ? {} : { completed: changes.completed }),
        },
      }),
    )
    return result.txid
  }

  async remove(todo: Todo) {
    const result = unwrap(
      await deleteApiV1TodosByTodoId({
        path: { todo_id: todo.id },
        headers: { 'If-Match': `"${todo.version}"` },
      }),
    )
    return result.txid
  }
}
