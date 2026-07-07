'use server'

import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createWeekPayload } from '@/app/api/v1/weeks/service'
import { isoWeekOf } from '@/lib/dates'

export type NuevaSemanaWin = { titulo: string; dod?: string }
export type NuevaSemanaTask = {
  ref: string
  titulo: string
  projectNombre?: string
  winPosicion?: number
  estimadoHoras: number
  dod: string[]
}

export async function crearSemanaAction(wins: NuevaSemanaWin[], tasks: NuevaSemanaTask[]) {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } })
  const factorUsado = user.factorManual ? Number(user.factorManual) : 1.4

  await createWeekPayload(session.userId, {
    isoWeek: isoWeekOf(new Date()),
    factorUsado,
    wins: wins.map((w, i) => ({ posicion: i + 1, titulo: w.titulo, dod: w.dod })),
    tasks: tasks.map((t) => ({
      ref: t.ref,
      titulo: t.titulo,
      projectNombre: t.projectNombre,
      winPosicion: t.winPosicion,
      estimadoMin: Math.round(t.estimadoHoras * 60),
      ajustadoMin: Math.round(t.estimadoHoras * 60 * factorUsado),
      dod: t.dod,
    })),
    blocks: [],
  })

  redirect('/semana')
}
