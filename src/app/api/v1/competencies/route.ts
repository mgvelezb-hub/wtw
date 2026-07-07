import { NextResponse } from 'next/server'
import { apiUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const user = await apiUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const competencias = await prisma.competency.findMany({
    orderBy: [{ tipo: 'asc' }, { grupo: 'asc' }, { orden: 'asc' }],
  })
  return NextResponse.json({ competencias })
}
