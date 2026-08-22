import { verifySession } from '@/lib/auth'
import { getCoberturaParaManager } from './service'

export default async function ReportDetallePage({ params }: { params: Promise<{ reportId: string }> }) {
  const session = await verifySession()
  if (!session) return null

  const { reportId } = await params
  const detalle = await getCoberturaParaManager(session.userId, reportId)

  if (!detalle) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-paper">
        <p className="text-sm text-muted">No tienes acceso a este colaborador.</p>
      </main>
    )
  }

  return (
    <main className="min-h-dvh bg-paper">
      <div className="mx-auto max-w-2xl space-y-6 p-4">
        <h1 className="text-2xl font-semibold text-ink">{detalle.report.nombre}</h1>

        {detalle.gapsTop5.length > 0 && (
          <section>
            <h2 className="lbl mb-2">Huecos para staffing</h2>
            <div className="flex flex-col">
              {detalle.gapsTop5.map((g) => (
                <div key={g.id} className="hair bg-warn-soft px-3 py-2 text-sm text-warn">
                  {g.texto}
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="lbl mb-2">Cobertura completa</h2>
          <div className="flex flex-col">
            {detalle.cobertura.map((c) => (
              <div
                key={c.id}
                className={`hair grid grid-cols-[1fr_48px] items-center gap-3 px-1 py-2 text-sm ${
                  c.evidenciaCount === 0 ? 'bg-warn-soft text-warn' : 'text-ink'
                }`}
              >
                <span>{c.texto}</span>
                <span className="num text-right text-xs text-faint">{c.evidenciaCount}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
