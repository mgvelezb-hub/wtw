import { prisma } from '@/lib/prisma'

// Cobertura de competencias. Antes solo contaba evidencias planas; lo que sirve
// para crecer es el hueco contra el nivel OBJETIVO, no el conteo absoluto. Ver
// docs/plans/2026-08-10-alineacion-council.md §Fase 2b.

export type CompetenciaCobertura = {
  id: string
  tipo: string
  grupo: string | null
  texto: string
  evidenciaCount: number
  // Días desde la última evidencia. null = nunca. Es la señal que importa: una
  // competencia con 5 evidencias de hace un año está tan hueca como una vacía.
  diasDesdeUltima: number | null
}

export type CoberturaPorGrupo = {
  grupo: string
  tipo: string
  total: number
  conEvidencia: number
  competencias: CompetenciaCobertura[]
}

export type EslabonEscalafon = {
  nombre: string
  orden: number
  esActual: boolean
  esObjetivo: boolean
}

export type DesarrolloView = {
  nivelActual: string | null
  nivelObjetivo: string | null
  expectativasObjetivo: string | null
  // El camino completo, no solo actual→objetivo. Faltaban Director y Socio: el
  // escalafón se cortaba en Gerente Sr y la ruta larga no se podía ver.
  escalafon: EslabonEscalafon[]
  grupos: CoberturaPorGrupo[]
  totalReactivos: number
  totalConEvidencia: number
  // Reactivos sin ninguna evidencia, que es la lista de trabajo real.
  huecos: CompetenciaCobertura[]
}

const GRUPO_INDIVIDUAL = 'Conductas individuales'

function dias(desde: Date, hasta: Date): number {
  return Math.floor((hasta.getTime() - desde.getTime()) / 86_400_000)
}

export async function getDesarrollo(userId: string, hoy: Date = new Date()): Promise<DesarrolloView> {
  const [user, competencias, niveles] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        nivelActual: { select: { nombre: true } },
        nivelObjetivo: { select: { nombre: true, expectativas: true } },
      },
    }),
    prisma.competency.findMany({
      include: { evidences: { where: { userId }, select: { createdAt: true } } },
      orderBy: [{ tipo: 'asc' }, { grupo: 'asc' }, { orden: 'asc' }],
    }),
    prisma.level.findMany({ orderBy: { orden: 'asc' }, select: { nombre: true, orden: true } }),
  ])

  const mapeadas: CompetenciaCobertura[] = competencias.map((c) => {
    const ultima = c.evidences.reduce<Date | null>((max, e) => (max === null || e.createdAt > max ? e.createdAt : max), null)
    return {
      id: c.id,
      tipo: c.tipo,
      grupo: c.grupo,
      texto: c.texto,
      evidenciaCount: c.evidences.length,
      diasDesdeUltima: ultima ? dias(ultima, hoy) : null,
    }
  })

  const porGrupo = new Map<string, CompetenciaCobertura[]>()
  for (const c of mapeadas) {
    const clave = c.grupo ?? GRUPO_INDIVIDUAL
    const lista = porGrupo.get(clave)
    if (lista) lista.push(c)
    else porGrupo.set(clave, [c])
  }

  const grupos: CoberturaPorGrupo[] = [...porGrupo.entries()].map(([grupo, lista]) => ({
    grupo,
    tipo: lista[0].tipo,
    total: lista.length,
    conEvidencia: lista.filter((c) => c.evidenciaCount > 0).length,
    competencias: lista,
  }))

  return {
    nivelActual: user.nivelActual?.nombre ?? null,
    nivelObjetivo: user.nivelObjetivo?.nombre ?? null,
    expectativasObjetivo: user.nivelObjetivo?.expectativas ?? null,
    escalafon: niveles.map((n) => ({
      nombre: n.nombre,
      orden: n.orden,
      esActual: n.nombre === user.nivelActual?.nombre,
      esObjetivo: n.nombre === user.nivelObjetivo?.nombre,
    })),
    grupos,
    totalReactivos: mapeadas.length,
    totalConEvidencia: mapeadas.filter((c) => c.evidenciaCount > 0).length,
    huecos: mapeadas.filter((c) => c.evidenciaCount === 0),
  }
}

// Vista plana de cobertura. La usa /equipo/[reportId] para ver la cobertura de un
// reporte, donde no aplica el contraste contra nivel objetivo propio.
export async function getCoberturaCompetencias(userId: string): Promise<
  Array<{ id: string; tipo: string; grupo: string | null; texto: string; evidenciaCount: number }>
> {
  const view = await getDesarrollo(userId)
  return view.grupos.flatMap((g) =>
    g.competencias.map((c) => ({
      id: c.id,
      tipo: c.tipo,
      grupo: c.grupo,
      texto: c.texto,
      evidenciaCount: c.evidenciaCount,
    }))
  )
}

// Competencias para el selector de evidencia. Se ordenan poniendo primero los
// huecos: si vas a registrar una evidencia, lo más valioso es que llene un
// reactivo vacío en vez de engordar uno que ya tiene cinco.
export type CompetenciaOpcion = { id: string; etiqueta: string; vacia: boolean }

export async function competenciasParaEvidencia(userId: string): Promise<CompetenciaOpcion[]> {
  const competencias = await prisma.competency.findMany({
    include: { evidences: { where: { userId }, select: { id: true } } },
    orderBy: [{ tipo: 'asc' }, { grupo: 'asc' }, { orden: 'asc' }],
  })

  return competencias
    .map((c) => ({
      id: c.id,
      etiqueta: `${c.grupo ?? GRUPO_INDIVIDUAL} · ${c.texto.slice(0, 90)}${c.texto.length > 90 ? '…' : ''}`,
      vacia: c.evidences.length === 0,
    }))
    .sort((a, b) => (a.vacia === b.vacia ? 0 : a.vacia ? -1 : 1))
}

// Bitácora de delegación: el acumulado de trabajo que Mau hizo y no debió hacer.
// Se reporta en horas reales, no en conteo de tareas — "23 h de trabajo de
// analista en 6 semanas" es un argumento; "9 tareas" no lo es.
export type BitacoraDelegacion = {
  tareas: Array<{ id: string; titulo: string; nota: string | null; minutosReales: number; proyecto: string | null }>
  minutosTotales: number
  desde: Date | null
}

export async function getBitacoraDelegacion(userId: string): Promise<BitacoraDelegacion> {
  const tareas = await prisma.task.findMany({
    where: { userId, delegable: true },
    include: {
      project: { select: { nombre: true } },
      timeEntries: { select: { seconds: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  const mapeadas = tareas.map((t) => ({
    id: t.id,
    titulo: t.titulo,
    nota: t.delegableNota,
    minutosReales: Math.round(t.timeEntries.reduce((s, e) => s + e.seconds, 0) / 60),
    proyecto: t.project?.nombre ?? null,
  }))

  return {
    tareas: mapeadas,
    minutosTotales: mapeadas.reduce((s, t) => s + t.minutosReales, 0),
    desde: tareas.length > 0 ? tareas[tareas.length - 1].createdAt : null,
  }
}

// Cierre del ciclo del pre-mortem: riesgos que se predijeron y qué pasó con ellos.
// Es evidencia fechada de capacidad predictiva — lo que pide "Quien tiene
// expertise técnico" ("puede prever complicaciones inherentes al proyecto").
export type HistorialRiesgos = {
  total: number
  cerrados: number
  acertados: number // se predijo y ocurrió
  defensasEfectivas: number // ocurrió y la defensa sirvió
  abiertos: Array<{ id: string; riesgo: string; defensa: string; isoWeek: string }>
}

export async function getHistorialRiesgos(userId: string): Promise<HistorialRiesgos> {
  const riesgos = await prisma.weekRisk.findMany({
    where: { week: { userId } },
    include: { week: { select: { isoWeek: true, estatus: true } } },
    orderBy: { id: 'asc' },
  })

  const cerrados = riesgos.filter((r) => r.ocurrio !== null)
  const ocurridos = cerrados.filter((r) => r.ocurrio === true)

  return {
    total: riesgos.length,
    cerrados: cerrados.length,
    acertados: ocurridos.length,
    defensasEfectivas: ocurridos.filter((r) => r.defensaFunciono === true).length,
    abiertos: riesgos
      .filter((r) => r.ocurrio === null && r.week.estatus !== 'closed')
      .map((r) => ({ id: r.id, riesgo: r.riesgo, defensa: r.defensa, isoWeek: r.week.isoWeek })),
  }
}
