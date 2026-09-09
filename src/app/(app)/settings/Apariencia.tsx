'use client'

import { useLocalStorage, escribirLocal } from '@/lib/local-store'
import { CLAVE_AVISO_JORNADA, CLAVE_PREFERENCIA, esPreferencia, type Preferencia } from '@/lib/tema'

const OPCIONES: { valor: Preferencia; etiqueta: string; nota: string }[] = [
  { valor: 'claro', etiqueta: 'Claro', nota: 'Siempre claro, sin importar la hora' },
  { valor: 'oscuro', etiqueta: 'Oscuro', nota: 'Siempre oscuro' },
  { valor: 'auto', etiqueta: 'Automático', nota: 'Sigue a tu dispositivo' },
]

// La preferencia es POR DISPOSITIVO, no por cuenta: el mismo criterio que el
// interruptor de avisos nativos. El iPad de la sala y el monitor del escritorio
// no tienen por qué querer el mismo tema.
export function Apariencia({ horario }: { horario: string }) {
  const prefCruda = useLocalStorage(CLAVE_PREFERENCIA)
  const avisoCrudo = useLocalStorage(CLAVE_AVISO_JORNADA)

  const preferencia: Preferencia = esPreferencia(prefCruda) ? prefCruda : 'auto'
  const avisar = avisoCrudo !== '0'

  return (
    <section className="bloque flex flex-col gap-3 p-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">Apariencia</h2>
        <p className="mt-1 text-xs text-muted">
          Reckon tiene tres temas. Los dos primeros los eliges tú; el tercero lo decide tu jornada.
        </p>
      </div>

      <div role="radiogroup" aria-label="Tema" className="flex flex-col">
        {OPCIONES.map((o) => (
          <label
            key={o.valor}
            className="flex min-h-11 cursor-pointer items-center gap-3 border-t border-hair py-2 text-sm first:border-t-0"
          >
            <input
              type="radio"
              name="tema"
              className="toque"
              checked={preferencia === o.valor}
              onChange={() => escribirLocal(CLAVE_PREFERENCIA, o.valor)}
            />
            <span className="text-ink">{o.etiqueta}</span>
            <span className="ml-auto text-right text-xs text-faint">{o.nota}</span>
          </label>
        ))}
      </div>

      <label
        className={`flex min-h-11 items-center gap-3 border-t border-hair pt-3 text-sm ${
          preferencia === 'auto' ? 'cursor-pointer' : 'opacity-50'
        }`}
      >
        <input
          type="checkbox"
          className="toque"
          checked={avisar}
          disabled={preferencia !== 'auto'}
          onChange={(e) => escribirLocal(CLAVE_AVISO_JORNADA, e.target.checked ? '1' : '0')}
        />
        <span className="min-w-0">
          <span className="text-ink">Cambiar de tema al salir de mi jornada</span>
          <span className="mt-0.5 block text-xs text-muted">
            Fuera de <span className="num">{horario}</span> la app toma un tercer tema, cálido, distinto del
            oscuro. No es comodidad: es el aviso de que lo que cronometres a partir de ahí ya cuenta como
            fuera de jornada. En sábado y domingo no aplica.
          </span>
        </span>
      </label>

      {preferencia !== 'auto' && (
        <p className="text-xs text-faint">
          Fijaste un tema, así que la jornada ya no lo mueve. Cambia a Automático para que vuelva a hacerlo.
        </p>
      )}
    </section>
  )
}
