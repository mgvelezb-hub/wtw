import { NextResponse } from 'next/server'
import { apiUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

// Captura rápida al inbox: sin semana, estatus backlog. Triage en el ritual.
export async function POST(req: Request) {
  const user = await apiUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  if (!body?.titulo) {
    return NextResponse.json({ error: 'titulo es requerido' }, { status: 422 })
  }

  let projectId: string | undefined
  if (body.projectNombre) {
    const project = await prisma.project.upsert({
      where: { userId_nombre: { userId: user.id, nombre: body.projectNombre } },
      create: { userId: user.id, nombre: body.projectNombre },
      update: {},
    })
    projectId = project.id
  }

  const task = await prisma.task.create({
    data: {
      userId: user.id,
      projectId,
      titulo: body.titulo,
      alcance: body.alcance ?? 'sow',
      dolorCliente: body.dolorCliente,
      estatus: 'backlog',
    },
  })
  return NextResponse.json({ task }, { status: 201 })
}

export async function GET(req: Request) {
  const user = await apiUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const tasks = await prisma.task.findMany({
    where: { userId: user.id, estatus: 'backlog' },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ tasks })
}
