import { NextResponse } from 'next/server'
import { apiUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const user = await apiUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const projects = await prisma.project.findMany({ where: { userId: user.id }, orderBy: { nombre: 'asc' } })
  return NextResponse.json({ projects })
}

export async function POST(req: Request) {
  const user = await apiUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  if (!body?.nombre) {
    return NextResponse.json({ error: 'nombre es requerido' }, { status: 422 })
  }

  const project = await prisma.project.create({
    data: {
      userId: user.id,
      nombre: body.nombre,
      cliente: body.cliente,
      tipo: body.tipo,
      color: body.color,
    },
  })
  return NextResponse.json({ project }, { status: 201 })
}
