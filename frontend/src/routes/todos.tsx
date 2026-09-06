import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { useTodoList } from '../features/todos/adapters/useTodoList'
import { useTodoMutationSnapshot } from '../features/todos/adapters/useTodoMutationSnapshot'
import { getTodoComposition } from '../features/todos/bootstrap/todoComposition'
import { TodoPage } from '../features/todos/presentation/TodoPage'

export const todoSearchSchema = z.object({
  filter: z.enum(['all', 'active', 'completed']).catch('all'),
})

export const Route = createFileRoute('/todos')({
  validateSearch: todoSearchSchema,
  loader: ({ context }) => getTodoComposition(context.dbClient).service.preload(),
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
  const { dbClient } = Route.useRouteContext()
  const composition = getTodoComposition(dbClient)
  const query = useTodoList(composition.repository, filter)
  const mutations = useTodoMutationSnapshot(composition.mutationStore)
  return (
    <TodoPage
      filter={filter}
      onFilterChange={(nextFilter) => void navigate({ search: { filter: nextFilter } })}
      todos={query.data ?? []}
      queryState={query}
      mutations={mutations}
      commands={composition.service}
    />
  )
}
