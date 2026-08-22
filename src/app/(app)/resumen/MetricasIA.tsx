import type { MetricaFeature } from '@/lib/ai/metricas'

// Etiquetas legibles para el dueño — el nombre técnico de la feature (el string
// que guarda AiCall.feature) queda como fallback si aparece una nueva que
// todavía no se agrega aquí.
const ETIQUETAS: Record<string, string> = {
  status_equipo: 'Status de equipo',
  clasificar_minuta: 'Clasificar minuta',
  resumen_minuta: 'Resumen de minuta',
  planear_recap: 'Planear: recap',
  planear_wins: 'Planear: sugerir Wins',
  planear_estimar: 'Planear: estimar duración',
  planear_triage: 'Planear: triage',
  planear_premortem: 'Planear: pre-mortem',
}

function etiquetaDe(feature: string): string {
  return ETIQUETAS[feature] ?? feature
}

function pctClase(pct: number | null): string {
  if (pct === null) return 'text-faint'
  if (pct >= 70) return 'text-ok'
  if (pct >= 40) return 'text-warn'
  return 'text-danger'
}

export function MetricasIA({ metricas }: { metricas: Record<string, MetricaFeature> }): React.ReactElement {
  const filas = Object.entries(metricas)

  return (
    <section className="hair mt-4 pt-4">
      <h2 className="lbl">Cómo está funcionando la IA</h2>
      <p className="mt-1 text-[11px] text-muted">
        Un % alto de edición en una feature = su prompt necesita trabajo. Esto decide qué IA se queda.
      </p>

      {filas.length === 0 ? (
        <p className="mt-3 text-sm text-faint">Sin llamadas aún.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="lbl pb-1 pr-2">Feature</th>
                <th className="lbl pb-1 pr-2 text-right">Llamadas</th>
                <th className="lbl pb-1 pr-2 text-right">% aceptado sin editar</th>
                <th className="lbl pb-1 text-right">Editados</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(([feature, m]) => (
                <tr key={feature} className="hair">
                  <td className="py-1.5 pr-2 text-ink">{etiquetaDe(feature)}</td>
                  <td className="num py-1.5 pr-2 text-right text-ink">{m.llamadas}</td>
                  {m.artifacts === null ? (
                    <td className="py-1.5 pr-2 text-right text-faint" colSpan={2}>
                      sin artifacts
                    </td>
                  ) : (
                    <>
                      <td className={`num py-1.5 pr-2 text-right font-semibold ${pctClase(m.artifacts.pctAceptacion)}`}>
                        {m.artifacts.pctAceptacion === null ? 'sin revisar' : `${m.artifacts.pctAceptacion}%`}
                      </td>
                      <td className="num py-1.5 text-right text-ink">
                        {m.artifacts.editados}
                        {m.artifacts.pendientes > 0 && (
                          <span className="num ml-1 text-[10px] text-faint">(+{m.artifacts.pendientes} sin revisar)</span>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
