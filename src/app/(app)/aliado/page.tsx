import { verifySession } from '@/lib/auth'
import { getLedgerAliado } from './service'

export default async function AliadoPage() {
  const session = await verifySession()
  if (!session) return null

  const ledger = await getLedgerAliado(session.userId)

  return (
    <main className="min-h-dvh bg-paper">
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Ledger Aliado</h1>
          <p className="text-sm text-muted">
            Trabajo fuera del plan que te posiciona como aliado estratégico — no es fuga, es inversión medible.
          </p>
        </div>

        {ledger.length === 0 ? (
          <p className="text-sm text-faint">Sin inversión aliado registrada todavía.</p>
        ) : (
          <div>
            {ledger.map((l) => (
              <div key={l.projectNombre} className="hair py-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink">{l.projectNombre}</span>
                  <span className="num text-sm text-muted">{l.horasAliado.toFixed(1)}h</span>
                </div>
                {l.valorizado !== null && (
                  <p className="mt-1 text-sm font-medium text-brand">
                    <span className="num">${l.valorizado.toLocaleString('es-MX')}</span> MXN de valor entregado no
                    cobrado
                  </p>
                )}
                {l.dolores.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {l.dolores.map((d) => (
                      <li key={d} className="text-xs text-muted">
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
