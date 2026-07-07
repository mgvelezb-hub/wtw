import { NextResponse } from 'next/server'
import { apiUser } from '@/lib/api-auth'
import { createWeekPayload, type CreateWeekPayload } from './service'

function validate(body: unknown): body is CreateWeekPayload {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>
  return (
    typeof b.isoWeek === 'string' &&
    typeof b.factorUsado === 'number' &&
    Array.isArray(b.wins) &&
    Array.isArray(b.tasks) &&
    Array.isArray(b.blocks)
  )
}

export async function POST(req: Request) {
  const user = await apiUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  if (!validate(body)) {
    return NextResponse.json(
      { error: 'payload inválido: isoWeek, factorUsado, wins[], tasks[], blocks[] son requeridos' },
      { status: 422 }
    )
  }

  try {
    const week = await createWeekPayload(user.id, body)
    return NextResponse.json({ week }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: `no se pudo crear la semana: ${(e as Error).message}` }, { status: 422 })
  }
}
