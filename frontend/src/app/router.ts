import { createRouter } from '@tanstack/react-router'

import { routeTree } from '../routeTree.gen'
import { dbClient, queryClient } from './clients'

export const router = createRouter({
  routeTree,
  context: { dbClient, queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  defaultPendingMs: 120,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
