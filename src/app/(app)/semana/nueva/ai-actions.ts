'use server'

import { verifySession } from '@/lib/auth'
import { callModel } from '@/lib/ai/client'
import { GENERATE } from '@/lib/ai/models'
import { prisma } from '@/lib/prisma'
import { RECAP, SUGERIR_WINS, ESTIMAR, TRIAGE, PREMORTEM } from './prompts'
import { contextoPlaneacion, type RecapAnterior } from './service'
import { extraerJSON } from './parse-json'

// Toda acción de IA del planeador devuelve este sobre en vez de tirar: el wizard
// tiene que seguir usable a mano si el modelo falla o falta la API key.
// Ver docs/plans/2026-08-05-planeador-semanal-design.md §Reglas de diseño (2).
export type ResultadoIA<T> = { ok: true; datos: T } | { ok: false; error: string }

function horas(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

async function llamar(feature: string, system: string, contenido: string): Promise<ResultadoIA<string>> {
  const session = await verifySession()
  if (!session) return { ok: false, error: 'no autenticado' }

  try {
    const { text } = await callModel({
      userId: session.userId,
      feature,
      model: GENERATE,
      system,
      messages: [{ role: 'user', content: contenido }],
    })
    return { ok: true, datos: text }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error desconocido'
    return { ok: false, error: msg.includes('ANTHROPIC_API_KEY') ? 'Falta la API key de Anthropic — llena este paso a mano.' : msg }
  }
}

async function llamarJSON<T>(feature: string, system: string, contenido: string): Promise<ResultadoIA<T>> {
  const r = await llamar(feature, system, contenido)
  if (!r.ok) return r
  const datos = extraerJSON<T>(r.datos)
  if (datos === null) return { ok: false, error: 'La IA respondió en un formato que no pude leer. Intenta otra vez o llénalo a mano.' }
  return { ok: true, datos }
}

function recapATexto(a: RecapAnterior): string {
  return [
    `Semana: ${a.isoWeek}`,
    `Plan: ${horas(a.planMin)} · Real: ${horas(a.realMin)}`,
    a.medicionIncompleta
      ? `Factor logrado: NO INTERPRETABLE — solo ${a.tareasConTiempo} de ${a.tareasHechas} tareas terminadas traen cronómetro. Di que la medición quedó incompleta y NO concluyas nada sobre velocidad.`
      : a.factorLogrado !== null
        ? `Factor logrado: ${a.factorLogrado} (estimado con ${a.factorUsado})`
        : 'Sin plan medible',
    `Tareas: ${a.tareasHechas} de ${a.tareasPlaneadas} terminadas`,
    `Wins: ${a.wins.map((w) => `${w.posicion}. "${w.titulo}" — ${w.estatus} (${w.tareasHechas}/${w.tareasTotal} tareas)`).join(' | ') || 'ninguno'}`,
    a.tareasSinTerminar.length > 0 ? `Sin terminar: ${a.tareasSinTerminar.join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

// --- Paso 1: recap de la semana anterior -----------------------------------

export async function recapAction(): Promise<ResultadoIA<string>> {
  const session = await verifySession()
  if (!session) return { ok: false, error: 'no autenticado' }

  const ctx = await contextoPlaneacion(session.userId)
  if (!ctx.anterior) return { ok: false, error: 'No hay semana anterior registrada — este paso no aplica.' }

  return llamar('planear_recap', RECAP, recapATexto(ctx.anterior))
}

// --- Paso 2: sugerir Wins ---------------------------------------------------

export type WinSugerido = { titulo: string; dod?: string; porque?: string }

export async function sugerirWinsAction(): Promise<ResultadoIA<WinSugerido[]>> {
  const session = await verifySession()
  if (!session) return { ok: false, error: 'no autenticado' }

  const ctx = await contextoPlaneacion(session.userId)
  const contenido = [
    `Backlog (${ctx.backlog.length} pendientes):`,
    ...ctx.backlog
      .slice(0, 40)
      .map((t) => `- [${t.id}] ${t.titulo}${t.proyecto ? ` (${t.proyecto})` : ''}${t.deadline ? ` deadline ${t.deadline}` : ''}${t.urgente ? ' URGENTE' : ''}`),
    '',
    ctx.anterior
      ? `Wins de la semana pasada: ${ctx.anterior.wins.map((w) => `"${w.titulo}" — ${w.estatus}`).join(' | ')}`
      : 'Sin semana anterior.',
  ].join('\n')

  const r = await llamarJSON<WinSugerido[]>('planear_wins', SUGERIR_WINS, contenido)
  if (!r.ok) return r
  if (!Array.isArray(r.datos)) return { ok: false, error: 'La IA no devolvió una lista de Wins.' }
  return { ok: true, datos: r.datos.filter((w) => typeof w?.titulo === 'string' && w.titulo.trim() !== '').slice(0, 3) }
}

// --- Paso 3: estimar duraciones --------------------------------------------

export type Estimacion = { id: string; estimadoMin: number | null; nota?: string }

export async function estimarAction(
  tareas: Array<{ id: string; titulo: string; herramienta?: string | null; proyecto?: string | null }>
): Promise<ResultadoIA<Estimacion[]>> {
  const session = await verifySession()
  if (!session) return { ok: false, error: 'no autenticado' }
  if (tareas.length === 0) return { ok: true, datos: [] }

  // Referencias: tareas ya terminadas con tiempo real medido. Es lo que hace la
  // estimación específica de Mau en vez de un promedio de internet.
  const medidas = await prisma.task.findMany({
    where: { userId: session.userId, estatus: 'done', timeEntries: { some: {} } },
    select: { titulo: true, herramienta: true, timeEntries: { select: { seconds: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 25,
  })

  const contenido = [
    'Tareas a estimar:',
    ...tareas.map((t) => `- [${t.id}] ${t.titulo}${t.herramienta ? ` · herramienta: ${t.herramienta}` : ''}${t.proyecto ? ` · ${t.proyecto}` : ''}`),
    '',
    'Referencias (tareas ya medidas, tiempo real):',
    ...medidas.map((m) => {
      const min = Math.round(m.timeEntries.reduce((s, e) => s + e.seconds, 0) / 60)
      return `- ${m.titulo}${m.herramienta ? ` · ${m.herramienta}` : ''} → ${horas(min)}`
    }),
  ].join('\n')

  const r = await llamarJSON<Estimacion[]>('planear_estimar', ESTIMAR, contenido)
  if (!r.ok) return r
  if (!Array.isArray(r.datos)) return { ok: false, error: 'La IA no devolvió una lista de estimaciones.' }

  const idsValidos = new Set(tareas.map((t) => t.id))
  return {
    ok: true,
    datos: r.datos
      .filter((e) => idsValidos.has(e?.id))
      .map((e) => ({
        id: e.id,
        estimadoMin: typeof e.estimadoMin === 'number' && e.estimadoMin > 0 ? Math.round(e.estimadoMin) : null,
        nota: e.nota,
      })),
  }
}

// --- Paso 4: triage cuando no cabe -----------------------------------------

export type Triage = { sacar: Array<{ id: string; porque: string }>; nota?: string }

export async function triageAction(
  elegidas: Array<{ id: string; titulo: string; ajustadoMin: number; winPosicion?: number; deadline?: string | null }>,
  excedenteMin: number
): Promise<ResultadoIA<Triage>> {
  const contenido = [
    `Se pasa por ${horas(excedenteMin)}.`,
    'Tareas elegidas:',
    ...elegidas.map(
      (t) => `- [${t.id}] ${t.titulo} · ${horas(t.ajustadoMin)}${t.winPosicion ? ` · Win ${t.winPosicion}` : ' · sin Win'}${t.deadline ? ` · deadline ${t.deadline}` : ''}`
    ),
  ].join('\n')

  const r = await llamarJSON<Triage>('planear_triage', TRIAGE, contenido)
  if (!r.ok) return r
  const idsValidos = new Set(elegidas.map((t) => t.id))
  return {
    ok: true,
    datos: {
      sacar: Array.isArray(r.datos?.sacar) ? r.datos.sacar.filter((s) => idsValidos.has(s?.id)) : [],
      nota: r.datos?.nota,
    },
  }
}

// --- Paso 5: pre-mortem ----------------------------------------------------

export type PreMortem = { riesgos: Array<{ riesgo: string; defensa: string }>; desbloqueador?: string }

export async function premortemAction(
  wins: Array<{ titulo: string }>,
  cargaMin: number,
  planeableMin: number
): Promise<ResultadoIA<PreMortem>> {
  const session = await verifySession()
  if (!session) return { ok: false, error: 'no autenticado' }

  const ctx = await contextoPlaneacion(session.userId)
  const contenido = [
    `Wins: ${wins.map((w, i) => `${i + 1}. ${w.titulo}`).join(' | ') || 'ninguno definido'}`,
    `Carga: ${horas(cargaMin)} sobre ${horas(planeableMin)} planeables.`,
    ctx.anterior && ctx.anterior.tareasSinTerminar.length > 0
      ? `La semana pasada se atoró: ${ctx.anterior.tareasSinTerminar.join('; ')}`
      : 'Sin datos de atorones previos.',
  ].join('\n')

  const r = await llamarJSON<PreMortem>('planear_premortem', PREMORTEM, contenido)
  if (!r.ok) return r
  return {
    ok: true,
    datos: {
      riesgos: Array.isArray(r.datos?.riesgos)
        ? r.datos.riesgos.filter((x) => typeof x?.riesgo === 'string' && typeof x?.defensa === 'string').slice(0, 3)
        : [],
      desbloqueador: typeof r.datos?.desbloqueador === 'string' ? r.datos.desbloqueador : undefined,
    },
  }
}
