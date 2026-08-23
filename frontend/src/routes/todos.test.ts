import { describe, expect, it, vi } from 'vitest'

import { Route, todoSearchSchema } from './todos'

vi.mock('../features/todos/todoCollection', () => ({
  getTodoCollection: vi.fn(() => ({ preload: vi.fn(() => Promise.resolve()) })),
}))

describe('/todos route contract', () => {
  it('defaults invalid filters to all', () => {
    expect(todoSearchSchema.parse({ filter: 'not-a-filter' })).toEqual({ filter: 'all' })
  })

  it('preloads the Electric collection before rendering', async () => {
    const loader = Route.options.loader
    const collection = await import('../features/todos/todoCollection')
    if (typeof loader !== 'function') throw new Error('Expected a route loader function')

    await loader({ context: { dbClient: {} }, location: {} } as never)

    expect(collection.getTodoCollection).toHaveBeenCalled()
  })
})
