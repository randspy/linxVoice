import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Diagnostics } from './Diagnostics'

vi.mock('../api/generated/sdk.gen', () => ({
  getReadyz: vi.fn(() => Promise.resolve({ data: { status: 'ready' } })),
}))

describe('developer diagnostics', () => {
  it('reveals API, shape, and read-mode status on request', async () => {
    const user = userEvent.setup()
    renderDiagnostics()

    expect(screen.queryByText('todos / full table')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'System' }))

    expect(await screen.findByText('ready')).toBeVisible()
    expect(screen.getByText('todos / full table')).toBeVisible()
    expect(screen.getByText('Electric live query')).toBeVisible()
  })
})

function renderDiagnostics() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <Diagnostics />
    </QueryClientProvider>,
  )
}
