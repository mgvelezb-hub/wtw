import { NextResponse } from 'next/server'
import { apiUser } from '@/lib/api-auth'
import { registrarEvidencia } from './service'

// La validación (nota, testigo, nivelDemostrado, ownership) vive en el service
// compartido con registrarEvidenciaAction — esta capa solo traduce a HTTP.

const NO_ENCONTRADO = new Set(['tarea no encontrada', 'entregable no encontrado'])

function soloString(valor: unknown): string | undefined {
  return typeof valor === 'string' ? valor : undefined
}

export async function POST(req: Request) {
  const user = await apiUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  if (!body?.competencyId || !body?.nota) {
    return NextResponse.json({ error: 'competencyId y nota son requeridos' }, { status: 422 })
  }

  try {
    const evidence = await registrarEvidencia(user.id, {
      competencyId: body.competencyId,
      nota: body.nota,
      taskId: soloString(body.taskId),
      deliverableId: soloString(body.deliverableId),
      testigo: soloString(body.testigo),
      nivelDemostrado: soloString(body.nivelDemostrado),
    })
    return NextResponse.json({ evidence }, { status: 201 })
  } catch (e) {
    const error = e instanceof Error ? e.message : 'error al registrar evidencia'
    return NextResponse.json({ error }, { status: NO_ENCONTRADO.has(error) ? 404 : 422 })
  }
}
