import { DbClient } from '@tanstack/react-db'
import { QueryClient } from '@tanstack/react-query'

export const dbClient = new DbClient()

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
})
