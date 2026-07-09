import { verifySession } from '@/lib/auth'
import { listInbox, listProjectsForInbox, getHerramientaFactors, HERRAMIENTAS } from './service'
import { InboxBoard } from './InboxBoard'

export default async function InboxPage() {
  const session = await verifySession()
  if (!session) return null

  const [tasks, proyectos, factores] = await Promise.all([
    listInbox(session.userId),
    listProjectsForInbox(session.userId),
    getHerramientaFactors(session.userId),
  ])

  return (
    <main className="min-h-dvh bg-[#f4efe3]">
      <InboxBoard
        tasks={tasks}
        proyectos={proyectos.map((p) => ({ id: p.id, nombre: p.nombre }))}
        herramientas={HERRAMIENTAS}
        factores={factores}
      />
    </main>
  )
}
