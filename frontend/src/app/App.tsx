import { DbProvider } from '@tanstack/react-db'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'

import { dbClient, queryClient } from './clients'
import { router } from './router'

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DbProvider client={dbClient}>
        <RouterProvider router={router} context={{ dbClient, queryClient }} />
      </DbProvider>
    </QueryClientProvider>
  )
}
