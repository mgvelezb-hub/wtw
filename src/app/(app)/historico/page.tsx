import { verifySession } from '@/lib/auth'
import { getHistorico } from './service'
import { TrendCard } from './TrendCard'

function formatDeltaNumber(delta: number, decimals: number, suffix = ''): string {
  const sign = delta > 0 ? '+' : delta < 0 ? '' : '±'
  return `${sign}${delta.toFixed(decimals)}${suffix}`
}

function formatHoras(minutos: number): string {
  return `${(minutos / 60).toFixed(1)}h`
}

export default async function HistoricoPage() {
  const session = await verifySession()
  if (!session) return null

  const historico = await getHistorico(session.userId)
  // El service ordena descendente (semana más reciente primero, para la tabla).
  // Las tendencias necesitan orden cronológico ascendente.
  const cronologico = [...historico].reverse()
  const isoWeeks = cronologico.map((h) => h.isoWeek)
  const hayTendencias = cronologico.length >= 2

  return (
    <main className="min-h-dvh bg-paper">
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <h1 className="text-2xl font-semibold text-ink">Histórico</h1>

        {historico.length === 0 ? (
          <p className="text-sm text-faint">
            Sin semanas cerradas todavía — el histórico aparece cuando una semana termina su ciclo.
          </p>
        ) : !hayTendencias ? (
          <p className="text-sm text-faint">Con 2+ semanas cerradas aparecen las tendencias.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <TrendCard
              title="Factor de realismo por semana"
              values={cronologico.map((h) => h.factorUsado)}
              isoWeeks={isoWeeks}
              formatValue={(v) => v.toFixed(2)}
              formatDelta={(d) => formatDeltaNumber(d, 2)}
              emptyMessage="Sin factor registrado."
            />
            <TrendCard
              title="Wins logrados por semana"
              values={cronologico.map((h) => h.winsLogrados)}
              isoWeeks={isoWeeks}
              formatValue={(v) => `${v}`}
              formatDelta={(d) => formatDeltaNumber(d, 0)}
              lastValueLabel={`${cronologico[cronologico.length - 1].winsLogrados}/${cronologico[cronologico.length - 1].winsTotal}`}
              emptyMessage="Sin wins registrados."
            />
            <TrendCard
              title="Horas medidas por semana"
              values={cronologico.map((h) => h.minutosMedidos)}
              isoWeeks={isoWeeks}
              formatValue={(v) => formatHoras(v)}
              formatDelta={(d) => formatDeltaNumber(d / 60, 1, 'h')}
              emptyMessage="Sin registros de tiempo todavía."
            />
          </div>
        )}

        {historico.length > 0 && (
          <div className="hair pt-4">
            <table className="w-full text-sm">
              <thead className="text-left">
                <tr>
                  <th className="lbl px-3 py-2">Semana</th>
                  <th className="lbl px-3 py-2">Factor</th>
                  <th className="lbl px-3 py-2">Wins</th>
                  <th className="lbl px-3 py-2">Horas (medidas/plan)</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((h) => (
                  <tr key={h.isoWeek} className="hair">
                    <td className="num px-3 py-2 text-ink">{h.isoWeek}</td>
                    <td className="num px-3 py-2 text-ink">{h.factorUsado.toFixed(2)}</td>
                    <td className="num px-3 py-2 text-ink">
                      {h.winsLogrados}/{h.winsTotal}
                    </td>
                    <td className="num px-3 py-2 text-muted">
                      {h.minutosMedidos !== null || h.minutosPlaneados !== null
                        ? `${h.minutosMedidos !== null ? formatHoras(h.minutosMedidos) : '—'} / ${
                            h.minutosPlaneados !== null ? formatHoras(h.minutosPlaneados) : '—'
                          }`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
