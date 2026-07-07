import { NextResponse } from 'next/server'
import { apiUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  const user = await apiUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  if (!body?.competencyId || !body?.nota) {
    return NextResponse.json({ error: 'competencyId y nota son requeridos' }, { status: 422 })
  }
  const evidence = await prisma.evidence.create({
    data: {
      userId: user.id,
      competencyId: body.competencyId,
      taskId: body.taskId,
      deliverableId: body.deliverableId,
      nota: body.nota,
    },
  })
  return NextResponse.json({ evidence }, { status: 201 })
}
