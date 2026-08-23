import type { DbClient } from '@tanstack/react-db'
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'

import { Diagnostics } from '../shared/Diagnostics'

export type RouterContext = {
  dbClient: DbClient
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  errorComponent: ({ error }) => (
    <main className="fatal-state">
      <p className="eyebrow">Signal interrupted</p>
      <h1>Something broke the line.</h1>
      <p>{error.message}</p>
      <a href="/todos">Reconnect</a>
    </main>
  ),
  notFoundComponent: () => (
    <main className="fatal-state">
      <p className="eyebrow">404 / No frequency</p>
      <h1>Nothing is broadcasting here.</h1>
      <a href="/todos">Return to the live list</a>
    </main>
  ),
})

function RootLayout() {
  return (
    <>
      <Outlet />
      <Diagnostics />
    </>
  )
}
