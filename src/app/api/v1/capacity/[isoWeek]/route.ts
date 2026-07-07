import { NextResponse } from 'next/server'
import { apiUser } from '@/lib/api-auth'
import { capacityForWeek } from '../service'

export async function GET(req: Request, { params }: { params: Promise<{ isoWeek: string }> }) {
  const user = await apiUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { isoWeek } = await params
  return NextResponse.json(await capacityForWeek(user.id, isoWeek))
}
