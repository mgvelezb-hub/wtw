'use client'

import { useSyncExternalStore } from 'react'

// El tema del sistema como STORE EXTERNO, igual que `reloj.ts` y
// `local-store.ts` (regla 20). `matchMedia` es exactamente lo que
// `useSyncExternalStore` existe para leer: un sistema externo que cambia solo y
// cuyo snapshot en el servidor es distinto del del cliente.
//
// El del servidor es `false` y no `null`: en el instante previo a hidratar, la
// app ya tiene un tema pintado por el script en línea, así que aquí no hace
// falta el estado "todavía no sé" — hace falta un default, y el default de la
// app siempre fue claro.

const CONSULTA = '(prefers-color-scheme: dark)'

function subscribe(notificar: () => void): () => void {
  const mq = window.matchMedia(CONSULTA)
  mq.addEventListener('change', notificar)
  return () => mq.removeEventListener('change', notificar)
}

function getSnapshot(): boolean {
  return window.matchMedia(CONSULTA).matches
}

function getServerSnapshot(): boolean {
  return false
}

export function useSistemaOscuro(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
