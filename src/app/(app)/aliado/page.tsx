import { verifySession } from '@/lib/auth'
import { getLedgerAliado } from './service'

export default async function AliadoPage() {
  const session = await verifySession()
  if (!session) return null

  const ledger = await getLedgerAliado(session.userId)

  return (
    <main className="min-h-dvh bg-neutral-50">
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <div>
          <h1 className="text-lg font-bold text-neutral-900">Ledger Aliado</h1>
          <p className="text-sm text-neutral-500">
            Trabajo fuera del plan que te posiciona como aliado estratégico — no es fuga, es inversión medible.
          </p>
        </div>

        {ledger.length === 0 ? (
          <p className="text-sm text-neutral-400">Sin inversión aliado registrada todavía.</p>
        ) : (
          <div className="space-y-3">
            {ledger.map((l) => (
              <div key={l.projectNombre} className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-neutral-900">{l.projectNombre}</span>
                  <span className="text-sm text-neutral-500">{l.horasAliado.toFixed(1)}h</span>
                </div>
                {l.valorizado !== null && (
                  <p className="mt-1 text-sm font-medium text-[#0A7C82]">
                    ${l.valorizado.toLocaleString('es-MX')} MXN de valor entregado no cobrado
                  </p>
                )}
                {l.dolores.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {l.dolores.map((d) => (
                      <li key={d} className="text-xs text-neutral-500">
                        · {d}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
