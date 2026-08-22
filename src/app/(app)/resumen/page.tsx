import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isoWeekOf, todayStr } from '@/lib/dates'
import { metricasAceptacion } from '@/lib/ai/metricas'
import { ResumenBoard } from './ResumenBoard'
import { MetricasIA } from './MetricasIA'

export default async function ResumenPage() {
  const session = await verifySession()
  if (!session) redirect('/login')

  const [minutas, proyectos, previos, metricas] = await Promise.all([
    prisma.minuta.findMany({
      where: { userId: session.userId },
      select: { id: true, titulo: true, fecha: true, project: { select: { nombre: true } } },
      orderBy: { fecha: 'desc' },
      take: 50,
    }),
    prisma.project.findMany({
      where: { userId: session.userId, estatus: 'activo' },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.artifact.findMany({
      where: { userId: session.userId, tipo: 'resumen_minuta' },
      select: { id: true, audiencia: true, borrador: true, final: true, estado: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    metricasAceptacion(session.userId),
  ])

  return (
    <main className="min-h-dvh bg-paper">
      <div className="mx-auto max-w-3xl p-4">
        <ResumenBoard
          minutas={minutas.map((m) => ({
            id: m.id,
            etiqueta: `${m.fecha.toISOString().slice(0, 10)} — ${m.titulo} (${m.project.nombre})`,
          }))}
          proyectos={proyectos}
          hoy={todayStr()}
          isoWeek={isoWeekOf(new Date())}
          previos={previos.map((a) => ({
            id: a.id,
            etiqueta: a.audiencia ?? 'Resumen',
            texto: a.final ?? a.borrador,
            estado: a.estado,
            fecha: a.createdAt.toISOString().slice(0, 10),
          }))}
        />
        <MetricasIA metricas={metricas} />
      </div>
    </main>
  )
}
