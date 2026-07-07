import { NextResponse } from 'next/server'
import { apiUser } from '@/lib/api-auth'
import { startTimer, stopTimer, runningEntry } from './service'

export async function GET(req: Request) {
  const user = await apiUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const entry = await runningEntry(user.id)
  return NextResponse.json({ entry })
}

export async function POST(req: Request) {
  const user = await apiUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()

  if (body?.action === 'start') {
    if (!body.taskId) return NextResponse.json({ error: 'taskId es requerido' }, { status: 422 })
    const entry = await startTimer(user.id, body.taskId)
    return NextResponse.json({ entry }, { status: 201 })
  }

  if (body?.action === 'stop') {
    const entry = await stopTimer(user.id)
    return NextResponse.json({ entry })
  }

  return NextResponse.json({ error: 'action debe ser "start" o "stop"' }, { status: 422 })
}
