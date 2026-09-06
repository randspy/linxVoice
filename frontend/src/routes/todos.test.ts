import { describe, expect, it, vi } from 'vitest'

import { Route, todoSearchSchema } from './todos'

const composition = vi.hoisted(() => ({ preload: vi.fn(() => Promise.resolve()) }))

vi.mock('../features/todos/bootstrap/todoComposition', () => ({
  getTodoComposition: vi.fn(() => ({ service: { preload: composition.preload } })),
}))

describe('/todos route contract', () => {
  it('defaults invalid filters to all', () => {
    expect(todoSearchSchema.parse({ filter: 'not-a-filter' })).toEqual({ filter: 'all' })
  })

  it('preloads the Electric collection before rendering', async () => {
    const loader = Route.options.loader
    if (typeof loader !== 'function') throw new Error('Expected a route loader function')

    await loader({ context: { dbClient: {} }, location: {} } as never)

    expect(composition.preload).toHaveBeenCalled()
  })
})
