import { useSyncExternalStore } from 'react'

type Snapshot = {
  pendingIds: ReadonlySet<string>
  confirmationDelayed: boolean
}

let snapshot: Snapshot = { pendingIds: new Set(), confirmationDelayed: false }
const listeners = new Set<() => void>()

function emit(next: Snapshot) {
  snapshot = next
  listeners.forEach((listener) => listener())
}

export const mutationStatus = {
  begin(id: string) {
    emit({ ...snapshot, pendingIds: new Set(snapshot.pendingIds).add(id) })
  },
  end(id: string) {
    const pendingIds = new Set(snapshot.pendingIds)
    pendingIds.delete(id)
    emit({ ...snapshot, pendingIds })
  },
  delayed() {
    emit({ ...snapshot, confirmationDelayed: true })
  },
  confirmed() {
    if (snapshot.confirmationDelayed) emit({ ...snapshot, confirmationDelayed: false })
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot() {
    return snapshot
  },
  reset() {
    emit({ pendingIds: new Set(), confirmationDelayed: false })
  },
}

export function useMutationStatus() {
  return useSyncExternalStore(mutationStatus.subscribe, mutationStatus.getSnapshot)
}
