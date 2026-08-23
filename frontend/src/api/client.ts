import { client } from './generated/client.gen'
import type { HttpError, ValidationError } from './generated/types.gen'

client.setConfig({ baseUrl: '', throwOnError: false })

export type ProblemDetail = HttpError | ValidationError

export class ApiError extends Error {
  readonly problem?: ProblemDetail
  readonly status?: number

  constructor(message: string, options?: { problem?: ProblemDetail; status?: number }) {
    super(message)
    this.name = 'ApiError'
    this.problem = options?.problem
    this.status = options?.status
  }
}

export function unwrap<T>(result: {
  data?: T
  error?: unknown
  response?: Response
}): NonNullable<T> {
  if (result.data !== undefined) return result.data as NonNullable<T>
  const problem = isProblem(result.error) ? result.error : undefined
  throw new ApiError(problem?.detail ?? 'The API request failed.', {
    problem,
    status: result.response?.status,
  })
}

function isProblem(value: unknown): value is ProblemDetail {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    'detail' in value &&
    typeof value.status === 'number' &&
    typeof value.detail === 'string'
  )
}
