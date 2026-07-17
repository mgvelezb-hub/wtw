import type { MinutaItemTipo } from '@prisma/client'
import type { MinutaView } from './status-actions'

// Sección "Minutas" — solo lectura (la captura vive en /dia, Tarea 6). Lista
// por fecha desc: título, fecha, asistentes, e items con tipo/texto/
// responsable/estado.

const TIPO_LABEL: Record<MinutaItemTipo, string> = {
  acuerdo: 'Acuerdo',
  pendiente_nuestro: 'Pendiente nuestro',
  pendiente_cliente: 'Pendiente cliente',
  solicitud_data: 'Solicitud de data',
  decision: 'Decisión',
  actividad_nueva: 'Actividad nueva',
  riesgo: 'Riesgo',
  nota: 'Nota',
}

function formatFecha(fecha: string): string {
  const [y, m, d] = fecha.split('-')
  return `${d}/${m}/${y}`
}

export function MinutasSection({ minutas }: { minutas: MinutaView[] }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase text-neutral-500">Minutas</h2>
      <div className="space-y-3">
        {minutas.map((m) => (
          <div key={m.id} className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium text-neutral-900">{m.titulo}</span>
              <span className="shrink-0 text-xs text-neutral-500">{formatFecha(m.fecha)}</span>
            </div>
            {m.asistentes.length > 0 && (
              <p className="mt-1 text-xs text-neutral-500">{m.asistentes.join(', ')}</p>
            )}
            <div className="mt-2 space-y-1.5">
              {m.items.map((item) => (
                <div key={item.id} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-neutral-500">
                    {TIPO_LABEL[item.tipo]}
                  </span>
                  <span className="flex-1 text-neutral-800">
                    {item.texto}
                    {item.responsable && <span className="text-neutral-500"> — {item.responsable}</span>}
                  </span>
                  {item.estado === 'convertido' && (
                    <span className="shrink-0 rounded-full bg-[#0A7C82]/10 px-2 py-0.5 text-[10px] font-semibold text-[#0A7C82]">
                      Convertido
                    </span>
                  )}
                </div>
              ))}
              {m.items.length === 0 && <p className="text-xs text-neutral-400">Sin items.</p>}
            </div>
          </div>
        ))}
        {minutas.length === 0 && <p className="text-sm text-neutral-400">Sin minutas registradas.</p>}
      </div>
    </section>
  )
}
