import { verifySession } from '@/lib/auth'
import { getCoberturaParaManager } from './service'

export default async function ReportDetallePage({ params }: { params: Promise<{ reportId: string }> }) {
  const session = await verifySession()
  if (!session) return null

  const { reportId } = await params
  const detalle = await getCoberturaParaManager(session.userId, reportId)

  if (!detalle) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-neutral-50">
        <p className="text-sm text-neutral-500">No tienes acceso a este colaborador.</p>
      </main>
    )
  }

  return (
    <main className="min-h-dvh bg-neutral-50">
      <div className="mx-auto max-w-2xl space-y-6 p-4">
        <h1 className="text-lg font-bold text-neutral-900">{detalle.report.nombre}</h1>

        {detalle.gapsTop5.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase text-neutral-500">Huecos para staffing</h2>
            <div className="space-y-1">
              {detalle.gapsTop5.map((g) => (
                <div key={g.id} className="rounded-md bg-amber-50 px-3 py-1.5 text-sm text-amber-800 shadow-sm">
                  {g.texto}
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase text-neutral-500">Cobertura completa</h2>
          <ul className="space-y-1">
            {detalle.cobertura.map((c) => (
              <li
                key={c.id}
                className={`rounded-md px-3 py-1.5 text-sm shadow-sm ${
                  c.evidenciaCount === 0 ? 'bg-amber-50 text-amber-800' : 'bg-white text-neutral-700'
                }`}
              >
                {c.texto} <span className="text-xs text-neutral-400">({c.evidenciaCount})</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  )
}
