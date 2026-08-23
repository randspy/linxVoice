import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { unwrap } from '../api/client'
import { getReadyz } from '../api/generated/sdk.gen'

export function Diagnostics() {
  const [open, setOpen] = useState(false)
  const readiness = useQuery({
    queryKey: ['readiness'],
    queryFn: async () => unwrap(await getReadyz()),
    refetchInterval: () => (document.visibilityState === 'visible' ? 30_000 : false),
  })

  return (
    <aside className={`diagnostics${open ? ' diagnostics--open' : ''}`}>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className={`diagnostics__dot diagnostics__dot--${readiness.status}`} />
        System
      </button>
      {open ? (
        <div className="diagnostics__panel">
          <p>
            API / DB <strong>{readiness.data?.status ?? readiness.status}</strong>
          </p>
          <p>
            Shape <strong>todos / full table</strong>
          </p>
          <p>
            Read mode <strong>Electric live query</strong>
          </p>
        </div>
      ) : null}
    </aside>
  )
}
