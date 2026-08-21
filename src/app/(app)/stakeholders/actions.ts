'use server'

import { revalidatePath } from 'next/cache'
import type { InteraccionTipo, StakeholderPostura, VariableConfianza } from '@prisma/client'
import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Escritura del mapa de stakeholders. Los modelos existían en el schema desde la
// Fase 2b pero no había forma de alimentarlos desde la app — la misma falla que
// tenían Evidence y Task.competencias.

function rango(n: number): number {
  // La escala es 1-3 y viene de un <select>, pero un valor fuera de rango
  // rompería la matriz en silencio (todo caería a "monitorear").
  return Math.min(3, Math.max(1, Math.round(n)))
}

export async function crearStakeholderAction(input: {
  nombre: string
  puesto?: string
  projectId?: string
  poder: number
  interes: number
  postura: StakeholderPostura
  queNecesita?: string
  cadenciaDias?: number | null
}): Promise<void> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')

  const nombre = input.nombre.trim()
  if (nombre === '') throw new Error('el stakeholder necesita un nombre')

  // Ownership del proyecto: sin esto un id ajeno colgaría a esta persona del
  // proyecto de otro usuario.
  if (input.projectId) {
    const proyecto = await prisma.project.findFirst({
      where: { id: input.projectId, userId: session.userId },
      select: { id: true },
    })
    if (!proyecto) throw new Error('proyecto no encontrado')
  }

  const yaExiste = await prisma.stakeholder.findUnique({
    where: { userId_nombre: { userId: session.userId, nombre } },
    select: { id: true },
  })
  if (yaExiste) throw new Error(`ya existe un stakeholder llamado "${nombre}"`)

  await prisma.stakeholder.create({
    data: {
      userId: session.userId,
      nombre,
      puesto: input.puesto?.trim() || null,
      projectId: input.projectId || null,
      poder: rango(input.poder),
      interes: rango(input.interes),
      postura: input.postura,
      queNecesita: input.queNecesita?.trim() || null,
      cadenciaDias: input.cadenciaDias ?? null,
    },
  })

  revalidatePath('/stakeholders')
}

export async function actualizarStakeholderAction(
  id: string,
  cambio: {
    puesto?: string
    projectId?: string | null
    poder?: number
    interes?: number
    legitimidad?: boolean
    urgencia?: boolean
    postura?: StakeholderPostura
    queNecesita?: string
    cadenciaDias?: number | null
    notas?: string
  }
): Promise<void> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')

  if (cambio.projectId) {
    const proyecto = await prisma.project.findFirst({
      where: { id: cambio.projectId, userId: session.userId },
      select: { id: true },
    })
    if (!proyecto) throw new Error('proyecto no encontrado')
  }

  const { count } = await prisma.stakeholder.updateMany({
    where: { id, userId: session.userId },
    data: {
      ...(cambio.puesto !== undefined ? { puesto: cambio.puesto.trim() || null } : {}),
      ...(cambio.projectId !== undefined ? { projectId: cambio.projectId || null } : {}),
      ...(cambio.poder !== undefined ? { poder: rango(cambio.poder) } : {}),
      ...(cambio.interes !== undefined ? { interes: rango(cambio.interes) } : {}),
      ...(cambio.legitimidad !== undefined ? { legitimidad: cambio.legitimidad } : {}),
      ...(cambio.urgencia !== undefined ? { urgencia: cambio.urgencia } : {}),
      ...(cambio.postura !== undefined ? { postura: cambio.postura } : {}),
      ...(cambio.queNecesita !== undefined ? { queNecesita: cambio.queNecesita.trim() || null } : {}),
      ...(cambio.cadenciaDias !== undefined ? { cadenciaDias: cambio.cadenciaDias } : {}),
      ...(cambio.notas !== undefined ? { notas: cambio.notas.trim() || null } : {}),
    },
  })
  if (count === 0) throw new Error('stakeholder no encontrado')

  revalidatePath('/stakeholders')
}

// Registrar un contacto REAL. Es el único dato que hace que la cadencia signifique
// algo: sin interacciones, el mapa es otro tablero de intenciones.
//
// `competencyId` es opcional y cierra el ciclo de la pieza 1 de la Fase 2b —
// capturar evidencia en el momento del trabajo, no como ritual aparte. Una junta
// con un stakeholder de poder alto ES la evidencia de "La mano del Rey"; pedirla
// después, en otra pantalla, es exactamente lo que no ocurre.
export async function registrarInteraccionAction(input: {
  stakeholderId: string
  fecha: string
  tipo: InteraccionTipo
  nota?: string
  competencyId?: string
  // Qué variable de la Trust Equation movió el contacto. Null explícito = hubo
  // contacto y no construyó nada: cuenta para la cadencia, no para la confianza.
  variableConfianza?: VariableConfianza | null
  // Un compromiso roto con esta persona. Pesa 3x en el marcador de salud, así que
  // registrarlo tiene consecuencia real — por eso va como toggle deliberado y no
  // como un tipo más del selector, donde se elegiría por accidente.
  esIncumplimiento?: boolean
}): Promise<void> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')

  const stakeholder = await prisma.stakeholder.findFirst({
    where: { id: input.stakeholderId, userId: session.userId },
    select: { id: true, nombre: true },
  })
  if (!stakeholder) throw new Error('stakeholder no encontrado')

  const nota = input.nota?.trim() || null

  await prisma.stakeholderInteraccion.create({
    data: {
      stakeholderId: stakeholder.id,
      fecha: new Date(input.fecha),
      tipo: input.tipo,
      nota,
      variableConfianza: input.variableConfianza ?? null,
      esIncumplimiento: input.esIncumplimiento ?? false,
    },
  })

  if (input.competencyId) {
    const competencia = await prisma.competency.findUnique({
      where: { id: input.competencyId },
      select: { id: true },
    })
    // Una competencia inválida no debe tirar la interacción, que es el dato que
    // de verdad importa: se registra el contacto y se omite la evidencia.
    if (competencia) {
      await prisma.evidence.create({
        data: {
          userId: session.userId,
          competencyId: competencia.id,
          nota: `${input.tipo} con ${stakeholder.nombre}${nota ? ` — ${nota}` : ''}`,
        },
      })
      revalidatePath('/desarrollo')
    }
  }

  revalidatePath('/stakeholders')
}

export async function borrarInteraccionAction(id: string): Promise<void> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')

  const { count } = await prisma.stakeholderInteraccion.deleteMany({
    where: { id, stakeholder: { userId: session.userId } },
  })
  if (count === 0) throw new Error('interacción no encontrada')

  revalidatePath('/stakeholders')
}

export async function borrarStakeholderAction(id: string): Promise<void> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')

  const { count } = await prisma.stakeholder.deleteMany({ where: { id, userId: session.userId } })
  if (count === 0) throw new Error('stakeholder no encontrado')

  revalidatePath('/stakeholders')
}
