'use client'

import { useEffect, useRef, useState } from 'react'

export function useWakeLock(active: boolean): { supported: boolean } {
  const [supported, setSupported] = useState(true)
  const lockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!active) return
    if (!('wakeLock' in navigator)) {
      setSupported(false)
      return
    }

    let cancelled = false

    async function requestLock() {
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled) {
          await lock.release()
          return
        }
        lockRef.current = lock
      } catch {
        setSupported(false)
      }
    }

    requestLock()

    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && lockRef.current === null) requestLock()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      lockRef.current?.release()
      lockRef.current = null
    }
  }, [active])

  return { supported }
}
