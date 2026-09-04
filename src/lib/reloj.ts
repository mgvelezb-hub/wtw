'use client'

import { useSyncExternalStore } from 'react'

// El reloj como STORE EXTERNO, no como estado que un efecto rellena.
//
// El patrón viejo —`useState(null)` + `useEffect(() => setTick(Date.now()))`—
// era correcto en su intención (regla 1: nunca `Date.now()` como valor inicial
// de un componente que renderiza en servidor) pero equivocado en su mecánica:
// arranca un render extra en cuanto monta y `react-hooks/set-state-in-effect`
// lo marca con razón. El reloj es exactamente lo que `useSyncExternalStore`
// existe para leer: un sistema externo que cambia solo, con un snapshot para el
// servidor distinto del del cliente.
//
// El intervalo es UNO para toda la app, no uno por componente: /dia y /focus
// leen el mismo tick y repintan en el mismo frame.

let valor: number | null = null
let intervalo: ReturnType<typeof setInterval> | null = null
const suscriptores = new Set<() => void>()

function tick(): void {
  valor = Date.now()
  for (const notificar of suscriptores) notificar()
}

function subscribe(notificar: () => void): () => void {
  suscriptores.add(notificar)
  if (intervalo === null) {
    tick()
    intervalo = setInterval(tick, 1000)
  }
  return () => {
    suscriptores.delete(notificar)
    if (suscriptores.size === 0 && intervalo !== null) {
      clearInterval(intervalo)
      intervalo = null
      // Sin suscriptores el valor queda congelado y mentiría al siguiente que
      // se monte antes del primer tick. Se limpia para que vuelva a arrancar en
      // "todavía no sé la hora".
      valor = null
    }
  }
}

// El snapshot tiene que ser estable entre renders o React entra en bucle: se
// devuelve el mismo número hasta que el intervalo lo cambia.
function getSnapshot(): number | null {
  return valor
}

// En el servidor no hay hora que leer. `null` es el mismo contrato que tenía el
// `useState(null)`: quien lo consume ya sabe pintar "sin hora todavía".
function getServerSnapshot(): number | null {
  return null
}

/** Milisegundos del reloj, o null antes del primer tick (y en el servidor). */
export function useReloj(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
