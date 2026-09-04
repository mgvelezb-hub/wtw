'use client'

import { useState, useSyncExternalStore } from 'react'
import { esNativo, plataforma, probarNotificacionLocal } from '@/lib/nativo'

// Si estamos dentro del cascarón es un hecho del entorno, no estado de React:
// se lee como store externo con snapshot de servidor `false`, así el SSR y la
// hidratación coinciden y el cliente se repinta una sola vez con el valor real.
// (Mismo patrón que `lib/reloj.ts` y `lib/local-store.ts`; un `setState` dentro
// de `useEffect` es lo que el lint del repo prohíbe.)
const sinSuscripcion = () => () => {}
function useEsNativo(): boolean {
  return useSyncExternalStore(sinSuscripcion, esNativo, () => false)
}

// Panel del spike nativo. Solo existe dentro del cascarón: en Safari no se pinta
// nada.
export function NativoPanel() {
  const nativo = useEsNativo()
  const [estado, setEstado] = useState<string | null>(null)

  if (!nativo) return null

  async function probar() {
    setEstado('Programando…')
    try {
      const permiso = await probarNotificacionLocal(10)
      setEstado(
        permiso === 'granted'
          ? 'Programada. Manda la app al fondo: llega en 10 s.'
          : permiso === 'denied'
            ? 'Permiso negado. Se recupera solo desde Ajustes del sistema.'
            : 'Sin respuesta al permiso.',
      )
    } catch (e) {
      setEstado(`Falló: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-edge bg-surface p-6">
      <div>
        <h2 className="text-sm font-semibold text-ink">App nativa</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Estás en el cascarón de <span className="num">{plataforma()}</span>. Aquí los avisos no pasan por el
          servidor: se programan en el dispositivo.
        </p>
      </div>
      <button
        type="button"
        onClick={probar}
        className="rounded-md border border-hair bg-surface px-3 py-1.5 text-xs text-ink"
      >
        Probar notificación local (10 s)
      </button>
      {estado && <p className="text-xs text-muted">{estado}</p>}
    </section>
  )
}
