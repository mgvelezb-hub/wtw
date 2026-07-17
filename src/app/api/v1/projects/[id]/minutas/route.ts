import { NextResponse } from 'next/server'
import { apiUser } from '@/lib/api-auth'
import { createMinuta, listMinutas } from '@/app/api/v1/minutas/service'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  try {
    const minutas = await listMinutas(user.id, id)
    return NextResponse.json({ minutas })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  if (!body?.fecha || !body?.titulo || !Array.isArray(body?.asistentes)) {
    return NextResponse.json({ error: 'fecha, titulo y asistentes[] son requeridos' }, { status: 422 })
  }

  try {
    const minuta = await createMinuta({
      userId: user.id,
      projectId: id,
      blockId: body.blockId,
      calendarEventId: body.calendarEventId,
      fecha: body.fecha,
      titulo: body.titulo,
      asistentes: body.asistentes,
      notas: body.notas,
    })
    return NextResponse.json({ minuta }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 })
  }
}
