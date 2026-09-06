import type { TodoMutationTracker } from './ports'

export type TodoMutationSnapshot = Readonly<{
  pendingIds: ReadonlySet<string>
  confirmationDelayed: boolean
}>

const initialSnapshot = (): TodoMutationSnapshot => ({
  pendingIds: new Set(),
  confirmationDelayed: false,
})

export class TodoMutationStore implements TodoMutationTracker {
  private snapshot = initialSnapshot()
  private readonly listeners = new Set<() => void>()

  begin(id: string) {
    this.emit({ ...this.snapshot, pendingIds: new Set(this.snapshot.pendingIds).add(id) })
  }

  end(id: string) {
    const pendingIds = new Set(this.snapshot.pendingIds)
    pendingIds.delete(id)
    this.emit({ ...this.snapshot, pendingIds })
  }

  delayed() {
    this.emit({ ...this.snapshot, confirmationDelayed: true })
  }

  confirmed() {
    if (this.snapshot.confirmationDelayed) {
      this.emit({ ...this.snapshot, confirmationDelayed: false })
    }
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot() {
    return this.snapshot
  }

  reset() {
    this.emit(initialSnapshot())
  }

  private emit(next: TodoMutationSnapshot) {
    this.snapshot = next
    this.listeners.forEach((listener) => listener())
  }
}
