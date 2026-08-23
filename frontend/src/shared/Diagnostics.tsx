import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

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
    <aside className="diagnostics">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" type="button">
            <span className={`diagnostics__dot diagnostics__dot--${readiness.status}`} />
            System
          </Button>
        </PopoverTrigger>
        <PopoverContent className="diagnostics__panel" side="top" align="end" sideOffset={8}>
          <p>
            API / DB <strong>{readiness.data?.status ?? readiness.status}</strong>
          </p>
          <p>
            Shape <strong>todos / full table</strong>
          </p>
          <p>
            Read mode <strong>Electric live query</strong>
          </p>
        </PopoverContent>
      </Popover>
    </aside>
  )
}
