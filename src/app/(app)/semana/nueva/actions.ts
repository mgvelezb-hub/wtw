'use server'

import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createWeekPayload } from '@/app/api/v1/weeks/service'
import { isoWeekOf } from '@/lib/dates'

export type NuevaSemanaWin = { titulo: string; dod?: string }

// Una tarea del ritual puede venir del backlog (ya existe: `id`) o haberse
// capturado en el paso 3 (nueva: sin `id`). Se resuelven por caminos distintos
// —adoptar vs. crear— porque `tasks` en createWeekPayload siempre hace create y
// duplicaría los pendientes del backlog.
export type NuevaSemanaTask = {
  id?: string
  ref: string
  titulo: string
  projectNombre?: string
  winPosicion?: number
  estimadoMin: number
  dod: string[]
  // Día al que se asignó en el paso 4. Sin día, la tarea entra a la semana pero
  // sin bloque: queda en el parking lot de /dia.
  fecha?: string
}

export type CrearSemanaInput = {
  reflexion?: string
  desbloqueador?: string
  wins: NuevaSemanaWin[]
  tasks: NuevaSemanaTask[]
}

export async function crearSemanaAction(input: CrearSemanaInput) {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } })
  const factorUsado = user.factorManual ? Number(user.factorManual) : 1.4
  const ajustado = (min: number) => Math.round(min * factorUsado)

  const nuevas = input.tasks.filter((t) => !t.id)
  const delBacklog = input.tasks.filter((t) => t.id)

  await createWeekPayload(session.userId, {
    isoWeek: isoWeekOf(new Date()),
    factorUsado,
    reflexion: input.reflexion,
    desbloqueador: input.desbloqueador,
    // El planeador sí reutiliza el cascarón que Mi Día haya creado — de otro modo
    // planear el lunes después de abrir Mi Día es imposible. La guarda de "ya
    // tiene plan" sigue protegiendo contra duplicar una semana real.
    reutilizarVacia: true,
    wins: input.wins.map((w, i) => ({ posicion: i + 1, titulo: w.titulo, dod: w.dod })),
    tasks: nuevas.map((t) => ({
      ref: t.ref,
      titulo: t.titulo,
      projectNombre: t.projectNombre,
      winPosicion: t.winPosicion,
      estimadoMin: t.estimadoMin,
      ajustadoMin: ajustado(t.estimadoMin),
      dod: t.dod,
    })),
    adoptar: delBacklog.map((t) => ({
      id: t.id!,
      winPosicion: t.winPosicion,
      estimadoMin: t.estimadoMin,
      ajustadoMin: ajustado(t.estimadoMin),
    })),
    // Bloques "flex": el ritual decide EN QUÉ DÍA va cada tarea, no a qué hora.
    // La hora se acomoda en /dia con el reflow, que ya conoce juntas y jornada.
    blocks: input.tasks
      .filter((t) => t.fecha)
      .map((t) => ({
        fecha: t.fecha!,
        inicio: 'flex',
        fin: 'flex',
        tipo: 'tarea' as const,
        taskRef: t.id ?? t.ref,
        titulo: t.titulo,
        planMin: ajustado(t.estimadoMin),
      })),
  })

  redirect('/semana')
}
