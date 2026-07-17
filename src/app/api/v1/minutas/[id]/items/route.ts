import { NextResponse } from 'next/server'
import { apiUser } from '@/lib/api-auth'
import { addItem } from '@/app/api/v1/minutas/service'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  if (!body?.tipo || !body?.texto) {
    return NextResponse.json({ error: 'tipo y texto son requeridos' }, { status: 422 })
  }

  try {
    const item = await addItem(user.id, id, {
      tipo: body.tipo,
      texto: body.texto,
      responsable: body.responsable,
      responsableUserId: body.responsableUserId,
      fechaCompromiso: body.fechaCompromiso,
      orden: body.orden,
    })
    return NextResponse.json({ item }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 })
  }
}
