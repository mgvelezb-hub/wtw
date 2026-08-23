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
    <main className="min-h-dvh bg-paper">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-10">
        {/* El catálogo entra como `pie` y no como bloque aparte: es la última
            fila de la misma lista de hairlines que cierra la página. */}
        <DesarrolloBoard
          view={view}
          opciones={opciones}
          bitacora={{
            ...bitacora,
            desde: bitacora.desde ? bitacora.desde.toISOString().slice(0, 10) : null,
          }}
          riesgos={riesgos}
          pie={<CatalogoSection key="catalogo" catalogo={catalogo} />}
        />
      </div>
    </main>
  )
}
