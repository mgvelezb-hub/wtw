import type { MinutaItemTipo } from '@prisma/client'
import type { MinutaView } from './status-actions'
import { MinutaClasificar } from './MinutaClasificar'
import { MinutaEvidencia } from './MinutaEvidencia'

// Sección "Minutas" — la captura sigue viviendo en /dia, pero la CLASIFICACIÓN
// con IA se hace aquí: antes solo era alcanzable abriendo el drawer del día
// exacto de la junta, lo que volvía impráctico tocar una minuta de la semana
// pasada. Lista
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
    <section className="hair pt-6">
      <h2 className="lbl mb-2">Minutas</h2>
      <div className="divide-y divide-hair">
        {minutas.map((m) => (
          <div key={m.id} className="py-3">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium text-ink">{m.titulo}</span>
              <span className="num shrink-0 text-xs text-muted">{formatFecha(m.fecha)}</span>
            </div>
            {m.asistentes.length > 0 && (
              <p className="mt-1 text-xs text-muted">{m.asistentes.join(', ')}</p>
            )}
            {/* Bloque de flujo normal, no flex: colapsados los dos son botones
                inline que caben en un renglón; abierto, cada panel es un div de
                ancho completo. Con flex el panel abierto quedaría en media
                columna. */}
            <div>
              <MinutaClasificar minutaId={m.id} tieneNotas={m.tieneNotas} />
              <MinutaEvidencia minutaId={m.id} />
            </div>
            <div className="mt-2 space-y-1.5">
              {m.items.map((item) => (
                <div key={item.id} className="flex items-start gap-2 text-sm">
                  <span className="lbl mt-0.5 shrink-0">
                    {TIPO_LABEL[item.tipo]}
                  </span>
                  <span className="flex-1 text-ink">
                    {item.textoRich ? (
                      <span className="minuta-rich" dangerouslySetInnerHTML={{ __html: item.textoRich }} />
                    ) : (
                      item.texto
                    )}
                    {item.responsable && <span className="text-muted"> — {item.responsable}</span>}
                  </span>
                  {item.estado === 'convertido' && (
                    <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand-deep">
                      Convertido
                    </span>
                  )}
                </div>
              ))}
              {m.items.length === 0 && <p className="text-xs text-faint">Sin items.</p>}
            </div>
          </div>
        ))}
        {minutas.length === 0 && <p className="text-sm text-faint">Sin minutas registradas.</p>}
      </div>
    </section>
  )
}
