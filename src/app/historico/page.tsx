import { verifySession } from '@/lib/auth'
import { getHistorico } from './service'

export default async function HistoricoPage() {
  const session = await verifySession()
  if (!session) return null

  const historico = await getHistorico(session.userId)

  return (
    <main className="min-h-dvh bg-neutral-50">
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <h1 className="text-lg font-bold text-neutral-900">Histórico</h1>

        {historico.length === 0 ? (
          <p className="text-sm text-neutral-400">
            Sin semanas cerradas todavía — el histórico aparece cuando una semana termina su ciclo.
          </p>
        ) : (
          <table className="w-full overflow-hidden rounded-lg border border-neutral-200 bg-white text-sm shadow-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-3 py-2">Semana</th>
                <th className="px-3 py-2">Factor</th>
                <th className="px-3 py-2">Wins</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((h) => (
                <tr key={h.isoWeek} className="border-t border-neutral-100">
                  <td className="px-3 py-2">{h.isoWeek}</td>
                  <td className="px-3 py-2">{h.factorUsado.toFixed(2)}</td>
                  <td className="px-3 py-2">
                    {h.winsLogrados}/{h.winsTotal}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  )
}
