import { NextResponse } from 'next/server'
import { apiUser } from '@/lib/api-auth'
import { syncCalendar } from './service'

export async function POST(req: Request) {
  const user = await apiUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await syncCalendar(user.id))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 })
  }
}
