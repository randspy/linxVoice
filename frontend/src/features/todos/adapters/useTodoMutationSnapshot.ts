import { useSyncExternalStore } from 'react'

import type { TodoMutationStore } from '../application/todoMutationStore'

export function useTodoMutationSnapshot(store: TodoMutationStore) {
  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
  )
}
