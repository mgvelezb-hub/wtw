import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import { getDesarrollo, competenciasParaEvidencia, getBitacoraDelegacion, getHistorialRiesgos } from './service'
import { DesarrolloBoard } from './DesarrolloBoard'

export default async function DesarrolloPage() {
  const session = await verifySession()
  if (!session) redirect('/login')

  const [view, opciones, bitacora, riesgos] = await Promise.all([
    getDesarrollo(session.userId),
    competenciasParaEvidencia(session.userId),
    getBitacoraDelegacion(session.userId),
    getHistorialRiesgos(session.userId),
  ])

  return (
    <main className="min-h-dvh bg-neutral-50">
      <div className="mx-auto max-w-3xl p-4">
        <DesarrolloBoard
          view={view}
          opciones={opciones}
          bitacora={{
            ...bitacora,
            desde: bitacora.desde ? bitacora.desde.toISOString().slice(0, 10) : null,
          }}
          riesgos={riesgos}
        />
      </div>
    </main>
  )
}
