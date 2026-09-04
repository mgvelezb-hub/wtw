'use client'

import { useMemo, useSyncExternalStore } from 'react'

// `localStorage` como store externo. Mismo motivo que `reloj.ts`: leerlo con
// `useState(null)` + `useEffect(() => setX(localStorage.getItem(...)))` respeta
// la regla 1 (nada de localStorage durante el render, o la hidratación
// divergería) pero paga un render extra por montaje y dispara
// `react-hooks/set-state-in-effect`.
//
// `useSyncExternalStore` resuelve las dos cosas de una: el snapshot del
// servidor es `null` —el mismo contrato de "todavía no lo leí" que ya usaban
// AppShell, BriefingCard y el tour— y el del cliente lee la clave de verdad.
//
// Además arregla algo que el patrón viejo no cubría: dos componentes que miran
// la MISMA clave ya no se desincronizan, porque `escribirLocal` notifica a
// todos los suscriptores.

const suscriptores = new Map<string, Set<() => void>>()

function notificar(clave: string): void {
  for (const fn of suscriptores.get(clave) ?? []) fn()
}

function subscribe(clave: string): (fn: () => void) => () => void {
  return (fn) => {
    const set = suscriptores.get(clave) ?? new Set()
    set.add(fn)
    suscriptores.set(clave, set)
    // 'storage' solo dispara en OTRAS pestañas — de ahí que las escrituras
    // locales tengan que notificar a mano.
    function onStorage(e: StorageEvent): void {
      if (e.key === null || e.key === clave) fn()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      set.delete(fn)
      if (set.size === 0) suscriptores.delete(clave)
      window.removeEventListener('storage', onStorage)
    }
  }
}

// Cache por clave para que el snapshot sea estable: `getItem` devuelve un string
// nuevo cada llamada y React compara por identidad, así que sin esto un string
// igual se vería como un cambio y repintaría en cada render.
const cache = new Map<string, string | null>()

function getSnapshot(clave: string): () => string | null {
  return () => {
    let leido: string | null
    try {
      leido = window.localStorage.getItem(clave)
    } catch {
      // Safari en modo privado tira al leer. Sin valor legible se responde null,
      // igual que en el servidor: el consumidor decide el default.
      leido = null
    }
    if (cache.get(clave) === leido) return leido
    cache.set(clave, leido)
    return leido
  }
}

function getServerSnapshot(): string | null {
  return null
}

/** El valor crudo de la clave, o null si no está (y siempre null en el servidor). */
export function useLocalStorage(clave: string): string | null {
  // Memoizados por clave: `useSyncExternalStore` compara estas funciones por
  // identidad y re-suscribiría en cada render si se crearan de nuevo.
  const sub = useMemo(() => subscribe(clave), [clave])
  const snap = useMemo(() => getSnapshot(clave), [clave])
  return useSyncExternalStore(sub, snap, getServerSnapshot)
}

/** Escribe (o borra, con `null`) y notifica a todo lo que esté leyendo la clave. */
export function escribirLocal(clave: string, valor: string | null): void {
  try {
    if (valor === null) window.localStorage.removeItem(clave)
    else window.localStorage.setItem(clave, valor)
  } catch {
    // Sin persistencia, al menos el cambio se refleja en esta sesión.
  }
  cache.set(clave, valor)
  notificar(clave)
}
