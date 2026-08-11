import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import { getDesarrollo, competenciasParaEvidencia, getBitacoraDelegacion, getHistorialRiesgos, getCatalogoDesarrollo } from './service'
import { DesarrolloBoard } from './DesarrolloBoard'
import { CatalogoSection } from './CatalogoSection'

export default async function DesarrolloPage() {
  const session = await verifySession()
  if (!session) redirect('/login')

  const [view, opciones, bitacora, riesgos, catalogo] = await Promise.all([
    getDesarrollo(session.userId),
    competenciasParaEvidencia(session.userId),
    getBitacoraDelegacion(session.userId),
    getHistorialRiesgos(session.userId),
    getCatalogoDesarrollo(session.userId),
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
        <div className="mt-4">
          <CatalogoSection catalogo={catalogo} />
        </div>
      </div>
    </main>
  )
}
