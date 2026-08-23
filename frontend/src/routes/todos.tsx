import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { TodoPage } from '../features/todos/TodoPage'
import { getTodoCollection } from '../features/todos/todoCollection'

export const todoSearchSchema = z.object({
  filter: z.enum(['all', 'active', 'completed']).catch('all'),
})

export const Route = createFileRoute('/todos')({
  validateSearch: todoSearchSchema,
  loader: ({ context }) => getTodoCollection(context.dbClient).preload(),
  pendingComponent: () => (
    <main className="loading-state" aria-label="Loading synchronized Todos">
      <div className="loading-mark" />
      <p>Acquiring signal…</p>
    </main>
  ),
  component: TodosRoute,
})

function TodosRoute() {
  const { filter } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <TodoPage
      filter={filter}
      onFilterChange={(nextFilter) => void navigate({ search: { filter: nextFilter } })}
    />
  )
}
