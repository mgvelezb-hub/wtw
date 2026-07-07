import { NextResponse } from 'next/server'
import { apiUser } from '@/lib/api-auth'
import { getWeek } from '../service'

export async function GET(req: Request, { params }: { params: Promise<{ isoWeek: string }> }) {
  const user = await apiUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { isoWeek } = await params
  const week = await getWeek(user.id, isoWeek)
  if (!week) return NextResponse.json({ error: 'semana no encontrada' }, { status: 404 })

  return NextResponse.json({ week })
}
