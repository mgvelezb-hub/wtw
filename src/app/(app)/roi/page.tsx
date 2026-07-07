import { verifySession } from '@/lib/auth'
import { getROIRelacion } from './service'

export default async function ROIPage() {
  const session = await verifySession()
  if (!session) return null

  const roi = await getROIRelacion(session.userId)

  return (
    <main className="min-h-dvh bg-neutral-50">
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <div>
          <h1 className="text-lg font-bold text-neutral-900">ROI de relación</h1>
          <p className="text-sm text-neutral-500">Recompras orgánicas ligadas a la inversión aliado con cada cliente.</p>
        </div>

        {roi.length === 0 ? (
          <p className="text-sm text-neutral-400">Sin recompras registradas todavía.</p>
        ) : (
          <div className="space-y-2">
            {roi.map((r) => (
              <div key={r.origen} className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
                <p className="font-medium text-neutral-900">
                  {r.origen} → {r.recompras} {r.recompras === 1 ? 'proyecto adicional' : 'proyectos adicionales'}
                </p>
                <p className="text-xs text-neutral-500">{r.proyectos.join(' · ')}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
