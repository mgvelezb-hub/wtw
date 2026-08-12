import { prisma } from '@/lib/prisma'

// Mapa de stakeholders con cadencia de contacto. Es la pieza 4 de la Fase 2b y
// atiende dos cosas a la vez: la tercera expectativa de Gerente es *proximidad
// con stakeholders*, y dos roles VP completos son sobre poder e influencia ("La
// mano del Rey", "La estrategia que renovará al Estado"). Hoy los stakeholders
// de Liverpool viven como texto libre dentro de títulos de tareas — es decir, no
// existen como dato y no pueden generar evidencia verificable.
// Ver docs/plans/2026-08-10-alineacion-council.md §Fase 2b, pieza 4.

// La matriz clásica de poder/interés. Con escala 1-3, "alto" es 3: un 2 es la
// posición por defecto y tratarla como alta pondría a todo el mundo en el
// cuadrante de gestión cercana, que es lo mismo que no tener matriz.
const ALTO = 3

export type Cuadrante = 'gestionar_de_cerca' | 'mantener_satisfecho' | 'mantener_informado' | 'monitorear'

export const CUADRANTE_LABEL: Record<Cuadrante, string> = {
  gestionar_de_cerca: 'Gestionar de cerca',
  mantener_satisfecho: 'Mantener satisfecho',
  mantener_informado: 'Mantener informado',
  monitorear: 'Monitorear',
}

export const CUADRANTE_NOTA: Record<Cuadrante, string> = {
  gestionar_de_cerca: 'Poder alto e interés alto. Se les involucra en las decisiones.',
  mantener_satisfecho: 'Poder alto, interés bajo. Es el que hunde el proyecto sin avisar.',
  mantener_informado: 'Poder bajo, interés alto. Aliados naturales — informarlos es barato.',
  monitorear: 'Poder e interés bajos. Esfuerzo mínimo.',
}

export function cuadranteDe(poder: number, interes: number): Cuadrante {
  if (poder >= ALTO) return interes >= ALTO ? 'gestionar_de_cerca' : 'mantener_satisfecho'
  return interes >= ALTO ? 'mantener_informado' : 'monitorear'
}

export type InteraccionView = {
  id: string
  fecha: string
  tipo: string
  nota: string | null
}

export type StakeholderView = {
  id: string
  nombre: string
  puesto: string | null
  proyecto: string | null
  projectId: string | null
  poder: number
  interes: number
  postura: string
  queNecesita: string | null
  cadenciaDias: number | null
  notas: string | null
  cuadrante: Cuadrante
  ultimoContacto: string | null
  // Días desde el último contacto REAL. null = nunca se ha registrado uno, que no
  // es lo mismo que cero: es la señal más fuerte del mapa.
  diasSinContacto: number | null
  // Solo tiene sentido con cadencia comprometida. Sin cadencia no hay promesa que
  // romper, así que no se marca en rojo lo que nunca se prometió.
  cadenciaVencida: boolean
  // Cuántos días de retraso lleva contra su propia cadencia. Sirve para ordenar:
  // 20 días de retraso sobre una cadencia de 7 pesa más que 2 sobre una de 30.
  diasDeRetraso: number
  interacciones: InteraccionView[]
}

export type MapaStakeholders = {
  stakeholders: StakeholderView[]
  porCuadrante: Array<{ cuadrante: Cuadrante; label: string; nota: string; stakeholders: StakeholderView[] }>
  resumen: {
    total: number
    vencidos: number
    sinCadencia: number
    nuncaContactados: number
    // Los de poder alto sin contacto en el periodo son el riesgo real del
    // engagement, no el conteo total.
    poderAltoVencidos: number
  }
}

function dias(desde: Date, hasta: Date): number {
  return Math.floor((hasta.getTime() - desde.getTime()) / 86_400_000)
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function getMapaStakeholders(userId: string, hoy: Date = new Date()): Promise<MapaStakeholders> {
  const filas = await prisma.stakeholder.findMany({
    where: { userId },
    include: {
      project: { select: { id: true, nombre: true } },
      interacciones: { orderBy: { fecha: 'desc' }, take: 5 },
    },
    orderBy: [{ poder: 'desc' }, { nombre: 'asc' }],
  })

  const stakeholders: StakeholderView[] = filas.map((s) => {
    const ultima = s.interacciones[0] ?? null
    const diasSinContacto = ultima ? dias(ultima.fecha, hoy) : null
    const vencida = s.cadenciaDias !== null && (diasSinContacto === null || diasSinContacto > s.cadenciaDias)

    return {
      id: s.id,
      nombre: s.nombre,
      puesto: s.puesto,
      proyecto: s.project?.nombre ?? null,
      projectId: s.project?.id ?? null,
      poder: s.poder,
      interes: s.interes,
      postura: s.postura,
      queNecesita: s.queNecesita,
      cadenciaDias: s.cadenciaDias,
      notas: s.notas,
      cuadrante: cuadranteDe(s.poder, s.interes),
      ultimoContacto: ultima ? iso(ultima.fecha) : null,
      diasSinContacto,
      cadenciaVencida: vencida,
      // Sin contacto nunca, el retraso se cuenta como la cadencia completa: es lo
      // más conservador que se puede afirmar sin inventar una fecha de inicio.
      diasDeRetraso: vencida ? (diasSinContacto === null ? s.cadenciaDias! : diasSinContacto - s.cadenciaDias!) : 0,
      interacciones: s.interacciones.map((i) => ({ id: i.id, fecha: iso(i.fecha), tipo: i.tipo, nota: i.nota })),
    }
  })

  const orden: Cuadrante[] = ['gestionar_de_cerca', 'mantener_satisfecho', 'mantener_informado', 'monitorear']

  return {
    // Lo vencido primero, y dentro de eso el retraso mayor: la lista de arriba es
    // la lista de llamadas de hoy.
    stakeholders: [...stakeholders].sort((a, b) => {
      if (a.cadenciaVencida !== b.cadenciaVencida) return a.cadenciaVencida ? -1 : 1
      if (a.diasDeRetraso !== b.diasDeRetraso) return b.diasDeRetraso - a.diasDeRetraso
      return b.poder - a.poder
    }),
    porCuadrante: orden.map((c) => ({
      cuadrante: c,
      label: CUADRANTE_LABEL[c],
      nota: CUADRANTE_NOTA[c],
      stakeholders: stakeholders.filter((s) => s.cuadrante === c),
    })),
    resumen: {
      total: stakeholders.length,
      vencidos: stakeholders.filter((s) => s.cadenciaVencida).length,
      sinCadencia: stakeholders.filter((s) => s.cadenciaDias === null).length,
      nuncaContactados: stakeholders.filter((s) => s.diasSinContacto === null).length,
      poderAltoVencidos: stakeholders.filter((s) => s.cadenciaVencida && s.poder >= ALTO).length,
    },
  }
}
