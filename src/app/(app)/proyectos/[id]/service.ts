import { prisma } from '@/lib/prisma'
import { todayStr } from '@/lib/dates'

export type Semaforo = 'a_tiempo' | 'atrasado' | 'aceptado' | 'sin_fecha'

// El semáforo de un entregable.
//
// Antes solo comparaba proyectada contra comprometida, así que un entregable
// comprometido para ayer y SIN forecast salía en verde "A tiempo": la única
// forma de que se pusiera rojo era que alguien lo declarara tarde a mano.
// Justo la brecha de sobre-optimismo que el producto existe para atacar — la
// pantalla confirmaba el optimismo en vez de contradecirlo.
//
// El orden de las reglas es el argumento:
// 1. Aceptado ya no corre contra reloj, pase lo que pase con las fechas.
// 2. Sin fecha comprometida no hay contra qué medir, y decir "A tiempo" sería
//    inventar una promesa que nadie hizo.
// 3. Un compromiso que ya venció está atrasado aunque no haya forecast.
// 4. Un forecast que rebasa el compromiso está atrasado aunque falten semanas.
export function semaforoDe(
  d: { estatus: string; fechaComprometida: Date | null; fechaProyectada: Date | null },
  hoy: Date
): Semaforo {
  if (d.estatus === 'aceptado') return 'aceptado'
  if (!d.fechaComprometida) return 'sin_fecha'
  if (d.fechaComprometida < hoy) return 'atrasado'
  if (d.fechaProyectada && d.fechaProyectada > d.fechaComprometida) return 'atrasado'
  return 'a_tiempo'
}

export async function getProyectoDetalle(userId: string, projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      deliverables: {
        orderBy: { createdAt: 'asc' },
        include: { impactos: { orderBy: { fecha: 'desc' } } },
      },
      issues: { where: { estatus: 'abierto' } },
    },
  })
  if (!project || project.userId !== userId) return null

  // Las fechas del entregable son `@db.Date`: Prisma las devuelve como
  // medianoche UTC del día calendario. Para compararlas hay que construir HOY
  // igual —medianoche UTC del día de México—, no un instante: con el reloj del
  // servidor, un entregable comprometido para hoy salía atrasado desde las
  // 18:00 de ayer.
  const hoy = new Date(`${todayStr()}T00:00:00Z`)

  const entregables = project.deliverables.map((d) => {
    const semaforo = semaforoDe(d, hoy)
    return {
      id: d.id,
      nombre: d.nombre,
      avancePct: d.avancePct,
      presentado: d.presentado,
      presentadoA: d.presentadoA,
      semaforo,
      impactos: d.impactos.map((i) => ({
        id: i.id,
        fecha: i.fecha.toISOString().slice(0, 10),
        baseline: i.baseline,
        delta: i.delta,
        validadoPor: i.validadoPor,
        nota: i.nota,
      })),
    }
  })

  return { project, entregables, issuesAbiertos: project.issues }
}

// Un entregable PRESENTADO en persona es evidencia de "Quien presenta" y de "La
// mano del Rey" (ver comentario en el schema); uno enviado por correo no lo es.
// Se ancla al reactivo de orden más bajo de cada rol — Evidence.competencyId es
// singular, no hay forma de repartir un solo clic entre los 3 reactivos del rol.
export async function marcarPresentado(
  userId: string,
  deliverableId: string,
  presentado: boolean,
  presentadoA?: string,
): Promise<void> {
  const entregable = await prisma.deliverable.findFirst({
    where: { id: deliverableId, project: { userId } },
    select: { id: true, nombre: true },
  })
  if (!entregable) throw new Error('entregable no encontrado')

  await prisma.deliverable.update({
    where: { id: deliverableId },
    data: { presentado, presentadoA: presentado ? (presentadoA?.trim() || null) : null },
  })

  if (!presentado) return // no se borra evidencia ya generada al desmarcar

  for (const grupo of ['Quien presenta', 'La mano del Rey'] as const) {
    const competencia = await prisma.competency.findFirst({
      where: { tipo: 'rol', grupo },
      orderBy: { orden: 'asc' },
      select: { id: true },
    })
    if (!competencia) continue // datos de seed no cargados — no debe tronar

    const yaExiste = await prisma.evidence.findFirst({
      where: { userId, competencyId: competencia.id, deliverableId },
      select: { id: true },
    })
    if (yaExiste) continue // idempotente: prender/apagar/prender no duplica

    await prisma.evidence.create({
      data: {
        userId,
        competencyId: competencia.id,
        deliverableId,
        nota: `Entregable presentado en persona: "${entregable.nombre}"${
          presentadoA ? ` — ante ${presentadoA}` : ''
        }`,
      },
    })
  }
}

// Mini-BRM por entregable: el antes/después medible que arma la renovación con
// el cliente y, a la vez, es evidencia de Client Leadership para el promotion
// case. Doble uso, un solo registro.
export async function registrarImpacto(
  userId: string,
  deliverableId: string,
  data: { baseline: string; delta: string; validadoPor?: string; nota?: string },
): Promise<void> {
  const entregable = await prisma.deliverable.findFirst({
    where: { id: deliverableId, project: { userId } },
    select: { id: true },
  })
  if (!entregable) throw new Error('entregable no encontrado')

  const baseline = data.baseline.trim()
  const delta = data.delta.trim()
  if (!baseline || !delta) throw new Error('baseline y delta son requeridos')

  await prisma.impactoEntregable.create({
    data: {
      deliverableId,
      baseline,
      delta,
      validadoPor: data.validadoPor?.trim() || null,
      nota: data.nota?.trim() || null,
    },
  })
}
