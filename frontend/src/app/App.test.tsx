import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { App } from './App'

vi.mock('@tanstack/react-query', () => ({
  QueryClient: class QueryClient {},
  QueryClientProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('@tanstack/react-db', () => ({
  DbClient: class DbClient {},
  DbProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('@tanstack/react-router', () => ({
  RouterProvider: () => <div>Typed router mounted</div>,
  createRouter: () => ({}),
}))

vi.mock('../routeTree.gen', () => ({ routeTree: {} }))

describe('application shell', () => {
  it('provides the shared clients and mounts the router', () => {
    render(<App />)

    expect(screen.getByText('Typed router mounted')).toBeVisible()
  })
})
