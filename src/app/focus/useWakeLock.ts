'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

// Si el navegador trae la API es una capability del entorno, no estado de la
// app: se lee como store externo (sin suscripción, nunca cambia en vida de la
// pestaña) y el snapshot del servidor es `true` —el caso común— para que el
// aviso de "tu navegador no mantiene la pantalla encendida" no parpadee en la
// hidratación de los que sí la tienen.
function sinSuscripcion(): () => void {
  return () => {}
}

function hayWakeLockEnCliente(): boolean {
  return 'wakeLock' in navigator
}

export function useWakeLock(active: boolean): { supported: boolean } {
  const disponible = useSyncExternalStore(sinSuscripcion, hayWakeLockEnCliente, () => true)
  // Solo para el fallo del `request` en caliente: Safari puede tener la API y
  // negar el permiso. Arranca en true y solo el catch lo baja.
  const [otorgado, setOtorgado] = useState(true)
  const lockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return

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
        setOtorgado(false)
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

  return { supported: disponible && otorgado }
}
