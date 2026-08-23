import { describe, expect, it } from 'vitest'

import { ApiError, unwrap } from './client'

describe('API client boundary', () => {
  it('returns successful data', () => {
    expect(unwrap({ data: { status: 'ready' } })).toEqual({ status: 'ready' })
  })

  it('turns problem details into a typed error', () => {
    const problem = {
      type: 'about:blank',
      title: 'Validation failed',
      status: 422,
      detail: 'The title is invalid.',
      instance: '/api/v1/todos',
      errors: { title: ['Required'] },
    }

    expect(() => unwrap({ error: problem, response: new Response(null, { status: 422 }) })).toThrow(
      expect.objectContaining<ApiError>({
        name: 'ApiError',
        message: 'The title is invalid.',
        status: 422,
        problem,
      }),
    )
  })

  it('uses a safe fallback for an unstructured failure', () => {
    expect(() => unwrap({ error: new Error('network') })).toThrow('The API request failed.')
  })
})
