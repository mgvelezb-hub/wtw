import { prisma } from '@/lib/prisma'
import { isoWeekValida } from './service'

// Borra una semana COMPLETA con su plan: wins, bloques, riesgos y el registro
// de la semana. Es la segunda salida del muro de "ya está planeada", y existe
// porque ese muro nombraba dos acciones ("cierra o borra") que no ofrecía en
// ninguna parte.
//
// Vive aparte de `actions.ts` para poder probarlo sin sesión: la action solo
// resuelve quién eres y delega aquí.
//
// Lo que NO se borra: las tareas. Las que el ritual adoptó del backlog
// existían antes de la semana, y las que nació en él pueden tener tiempo
// medido o evidencia. Todas vuelven al backlog con su historia intacta —
// destruir horas cronometradas para poder replanear sería el peor intercambio
// posible en una app cuya tesis es que el número sea confiable.
export async function borrarSemana(
  userId: string,
  isoWeek: string
): Promise<{ ok: true } | { error: string }> {
  const semana = isoWeekValida(isoWeek)
  if (!semana) return { error: 'semana inválida' }

  // El filtro por userId es el candado: una semana ajena "no existe" desde
  // aquí, no se borra por id suelto (regla 4).
  const week = await prisma.week.findUnique({
    where: { userId_isoWeek: { userId, isoWeek: semana } },
    select: { id: true },
  })
  if (!week) return { error: `la semana ${semana} no existe` }

  await prisma.$transaction(async (tx) => {
    // Lo que seguía pendiente vuelve al backlog para poder replanearse.
    await tx.task.updateMany({
      where: { weekId: week.id, userId, estatus: { in: ['planned', 'in_progress'] } },
      data: { weekId: null, winId: null, estatus: 'backlog', ajustadoMin: null },
    })
    // Lo que ya tiene desenlace —terminado, descartado o delegado— NO regresa.
    // Un `backlog` sobre una tarea `done` revive trabajo cerrado: reaparece en
    // el vaciado del paso 3 y se puede volver a "terminar", contando dos veces.
    // Se sueltan las llaves de la semana que se va (el Win se borra con ella),
    // pero el estatus y el `ajustadoMin` quedan: son el registro de calibración
    // de esa tarea, y borrarlos destruye la medición que ya se pagó.
    await tx.task.updateMany({
      where: { weekId: week.id, userId, estatus: { in: ['done', 'deferred', 'delegada'] } },
      data: { weekId: null, winId: null },
    })
    await tx.block.deleteMany({ where: { weekId: week.id } })
    await tx.weekRisk.deleteMany({ where: { weekId: week.id } })
    await tx.win.deleteMany({ where: { weekId: week.id } })
    await tx.week.delete({ where: { id: week.id } })
  })

  return { ok: true }
}
