import { prisma } from '@/lib/prisma'

// Log de propuestas desde literatura o experiencias en otros proyectos —
// reactivo 11 de Gerente ("propone soluciones a partir de literatura o
// experiencias en otros proyectos"). Es el criterio más fácil de perder en el
// ruido y el que la IA no commoditiza: cualquiera puede generar una idea,
// pocos pueden mostrar que la leyeron en algún lado, la propusieron en un
// proyecto concreto y saben qué pasó con ella.
//
// El log es VIVO, no un formulario de una sola pasada: `insight` y `fuente`
// se conocen al momento de registrar; `dondePropuse` y `queParo` casi nunca
// se saben todavía — se completan semanas después, cuando la propuesta ya
// tuvo tiempo de adoptarse, descartarse o quedar en evaluación. Por eso son
// opcionales al crear y se actualizan aparte.

export type PropuestaView = {
  id: string
  insight: string
  fuente: string
  dondePropuse: string | null
  queParo: string | null
  fecha: string
}

function vista(p: {
  id: string
  insight: string
  fuente: string
  dondePropuse: string | null
  queParo: string | null
  fecha: Date
}): PropuestaView {
  return {
    id: p.id,
    insight: p.insight,
    fuente: p.fuente,
    dondePropuse: p.dondePropuse,
    queParo: p.queParo,
    fecha: p.fecha.toISOString().slice(0, 10),
  }
}

// Desc por fecha: la propuesta más reciente primero, porque es la que
// probablemente todavía está esperando su "qué pasó".
export async function listarPropuestas(userId: string): Promise<PropuestaView[]> {
  const propuestas = await prisma.propuestaLiteratura.findMany({
    where: { userId },
    orderBy: { fecha: 'desc' },
  })
  return propuestas.map(vista)
}

export type RegistrarPropuestaInput = {
  insight: string
  fuente: string
  dondePropuse?: string
}

export async function registrarPropuesta(userId: string, input: RegistrarPropuestaInput): Promise<PropuestaView> {
  const insight = input.insight.trim()
  const fuente = input.fuente.trim()
  if (insight === '') throw new Error('la propuesta necesita el insight')
  if (fuente === '') throw new Error('la propuesta necesita la fuente')

  const creada = await prisma.propuestaLiteratura.create({
    data: {
      userId,
      insight,
      fuente,
      dondePropuse: input.dondePropuse?.trim() || null,
    },
  })

  return vista(creada)
}

export type ActualizarPropuestaInput = {
  dondePropuse?: string
  queParo?: string
}

// El log es vivo: se propone hoy y se sabe qué pasó dos semanas después.
// Ambos campos son opcionales e independientes — completar "qué pasó" no
// debe forzar a re-escribir dónde se propuso, y viceversa.
export async function actualizarPropuesta(userId: string, id: string, cambio: ActualizarPropuestaInput): Promise<void> {
  const { count } = await prisma.propuestaLiteratura.updateMany({
    where: { id, userId },
    data: {
      ...(cambio.dondePropuse !== undefined ? { dondePropuse: cambio.dondePropuse.trim() || null } : {}),
      ...(cambio.queParo !== undefined ? { queParo: cambio.queParo.trim() || null } : {}),
    },
  })
  if (count === 0) throw new Error('propuesta no encontrada')
}
