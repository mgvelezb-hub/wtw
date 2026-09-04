import { verifySession } from '@/lib/auth'
import {
  listInbox,
  listProjectsForInbox,
  getHerramientaFactors,
  getFactoresPorClase,
  sugerenciasDeClase,
  HERRAMIENTAS,
} from './service'
import { InboxBoard } from './InboxBoard'

export default async function InboxPage() {
  const session = await verifySession()
  if (!session) return null

  const [tasks, proyectos, factores, factoresClase, sugerencias] = await Promise.all([
    listInbox(session.userId),
    listProjectsForInbox(session.userId),
    getHerramientaFactors(session.userId),
    getFactoresPorClase(session.userId),
    sugerenciasDeClase(session.userId),
  ])

  return (
    <main className="min-h-dvh bg-paper">
      <InboxBoard
        // Objeto plano, no el modelo de Prisma (regla 2): la lista solo usa estos
        // campos, y así no viajan columnas que la UI no necesita.
        tasks={tasks.map((t) => ({
          id: t.id,
          titulo: t.titulo,
          herramienta: t.herramienta,
          tipoTrabajo: t.tipoTrabajo,
          estimadoMin: t.estimadoMin,
          proyecto: t.project?.nombre ?? null,
        }))}
        proyectos={proyectos.map((p) => ({ id: p.id, nombre: p.nombre }))}
        herramientas={HERRAMIENTAS}
        factores={factores}
        factoresClase={factoresClase}
        sugerencias={sugerencias}
      />
    </main>
  )
}
