export class TodoConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TodoConflictError'
  }
}
