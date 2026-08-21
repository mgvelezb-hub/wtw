import type { VariableConfianza } from '@prisma/client'
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

// ── Salud de la relación ───────────────────────────────────────────────────
//
// La matriz de arriba dice A QUIÉN hay que atender. Lo que sigue dice CÓMO VA la
// relación con cada uno, que es lo que pide el reactivo 12 de Gerente y lo que la
// cadencia sola no puede contestar: cumplir el calendario y tener la relación rota
// son perfectamente compatibles.
//
// Tres piezas prestadas de literatura que sí midió esto:
//
// 1. Saliencia (Mitchell, Agle & Wood 1997): poder + legitimidad + urgencia. Los
//    tres atributos juntos clasifican al stakeholder, y la clase —no la intuición—
//    fija cada cuánto hay que hablarle. Un definitivo al que le hablas cada 30 días
//    no es un stakeholder atendido, es uno que ya se enteró por otro lado.
// 2. Trust Equation (Maister): la confianza no es un escalar difuso, son cuatro
//    variables que se trabajan por separado. Por eso el marcador dice cuál está
//    MENOS trabajada en vez de un "mejorar la relación" que no acciona nada.
// 3. Asimetría 3:1: un compromiso roto erosiona del orden de tres veces lo que
//    construye un contacto positivo. Si el marcador no la modela, premia el volumen
//    de contactos y perdona el incumplimiento — exactamente al revés de la realidad.

export type TierSaliencia = 'definitivo' | 'expectante' | 'latente'
export type EtiquetaSalud = 'sana' | 'enfriandose' | 'fria' | 'en_riesgo'

export const TIER_LABEL: Record<TierSaliencia, string> = {
  definitivo: 'definitivo',
  expectante: 'expectante',
  latente: 'latente',
}

export const TIER_NOTA: Record<TierSaliencia, string> = {
  definitivo: 'Poder, legitimidad y urgencia. Atención inmediata y prioritaria.',
  expectante: 'Dos de los tres atributos. Atención activa, no reactiva.',
  latente: 'Un atributo o ninguno. Vigilancia — puede escalar si gana urgencia.',
}

export const ETIQUETA_SALUD_LABEL: Record<EtiquetaSalud, string> = {
  sana: 'sana',
  enfriandose: 'enfriándose',
  fria: 'fría',
  en_riesgo: 'en riesgo',
}

export const VARIABLE_CONFIANZA_LABEL: Record<VariableConfianza, string> = {
  credibilidad: 'credibilidad',
  confiabilidad: 'confiabilidad',
  intimidad: 'intimidad',
  bajaAutoOrientacion: 'baja auto-orientación',
}

// El orden es el de la ecuación, y sirve de desempate cuando ninguna variable se
// ha trabajado: con un stakeholder nuevo se empieza por credibilidad, no por
// intimidad. Invertirlo produce el consejo de tutearse con alguien que todavía no
// sabe si sabes de lo que hablas.
export const VARIABLES_CONFIANZA: VariableConfianza[] = [
  'credibilidad',
  'confiabilidad',
  'intimidad',
  'bajaAutoOrientacion',
]

// Cadencia por defecto según la clase de saliencia. Solo aplica cuando el
// stakeholder NO tiene una cadencia propia comprometida: un compromiso explícito
// gana siempre sobre el default del modelo.
export const CADENCIA_POR_TIER: Record<TierSaliencia, number> = {
  definitivo: 7,
  expectante: 14,
  latente: 30,
}

// Ventana de la base de confianza. Más allá de 90 días el contacto ya no describe
// la relación de hoy: describe la de otro trimestre.
const VENTANA_DIAS = 90
// La asimetría, en un solo número. Cambiarlo cambia la tesis del marcador.
const PESO_INCUMPLIMIENTO = 3
// 50 = ni construida ni rota. El score arranca ahí para que la ausencia de datos
// se lea como "no sé", no como "va bien".
const BASE_NEUTRAL = 50
const PUNTOS_POR_UNIDAD = 8
const TOPE_CONFIANZA = 40
const TOPE_DECAY = 50
// Cuánto castiga cada "cadencia entera" de retraso. Con 25, quedarse al doble de
// la cadencia cuesta 25 puntos y al triple 50 (el tope).
const CASTIGO_POR_CADENCIA = 25

export type SaludStakeholder = {
  tier: TierSaliencia
  // Cuántos de los tres atributos de saliencia tiene. Se expone porque explica el
  // tier sin que haya que reconstruirlo.
  atributos: number
  cadenciaEsperada: number
  diasSinContacto: number | null
  // días / cadencia. >1 = frío, >=2 = crítico. null = nunca contactado, que es
  // peor que cualquier razón finita y por eso no se representa como número.
  razonCadencia: number | null
  contactosPositivos: number
  incumplimientos: number
  confianzaNeta: number
  score: number
  etiqueta: EtiquetaSalud
  variableMenosTrabajada: VariableConfianza
  siguienteAccion: string
}

export function tierDe(poder: number, legitimidad: boolean, urgencia: boolean): TierSaliencia {
  const atributos = (poder >= ALTO ? 1 : 0) + (legitimidad ? 1 : 0) + (urgencia ? 1 : 0)
  if (atributos >= 3) return 'definitivo'
  if (atributos === 2) return 'expectante'
  return 'latente'
}

function acotar(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export type StakeholderSaliencia = {
  poder: number
  legitimidad: boolean
  urgencia: boolean
  cadenciaDias: number | null
}

export type InteraccionSalud = {
  fecha: Date
  variableConfianza: VariableConfianza | null
  esIncumplimiento: boolean
}

// `hoy` es parámetro, nunca `Date.now()` adentro: un marcador que depende del reloj
// no se puede probar ni reproducir, y este además se renderiza en servidor.
export function saludDe(
  s: StakeholderSaliencia,
  interacciones: InteraccionSalud[],
  hoy: Date
): SaludStakeholder {
  const tier = tierDe(s.poder, s.legitimidad, s.urgencia)
  const atributos = (s.poder >= ALTO ? 1 : 0) + (s.legitimidad ? 1 : 0) + (s.urgencia ? 1 : 0)
  const cadenciaEsperada = s.cadenciaDias ?? CADENCIA_POR_TIER[tier]

  const ordenadas = [...interacciones].sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
  const ultima = ordenadas[0] ?? null
  const diasSinContacto = ultima ? dias(ultima.fecha, hoy) : null

  const ventana = ordenadas.filter((i) => dias(i.fecha, hoy) <= VENTANA_DIAS)
  const contactosPositivos = ventana.filter((i) => i.variableConfianza !== null).length
  const incumplimientos = ventana.filter((i) => i.esIncumplimiento).length
  const confianzaNeta = contactosPositivos - incumplimientos * PESO_INCUMPLIMIENTO

  const confianza = acotar(confianzaNeta * PUNTOS_POR_UNIDAD, -TOPE_CONFIANZA, TOPE_CONFIANZA)

  const razonCadencia = diasSinContacto === null ? null : diasSinContacto / cadenciaEsperada
  // Nunca contactado se castiga con el tope: no hay número de días que reportar,
  // pero tampoco hay relación que medir.
  const decay =
    razonCadencia === null
      ? TOPE_DECAY
      : acotar(Math.round((razonCadencia - 1) * CASTIGO_POR_CADENCIA), 0, TOPE_DECAY)

  const score = acotar(Math.round(BASE_NEUTRAL + confianza - decay), 0, 100)

  // Cada etiqueta apunta a UNA causa, y por eso el orden importa: un incumplimiento
  // sin compensar manda aunque la cadencia esté al día. Es el caso que la cadencia
  // sola no ve — "le hablo cada semana" no repara una promesa rota.
  const etiqueta: EtiquetaSalud =
    confianzaNeta < 0
      ? 'en_riesgo'
      : razonCadencia === null || razonCadencia >= 2
        ? 'fria'
        : razonCadencia > 1
          ? 'enfriandose'
          : 'sana'

  const conteo = new Map<VariableConfianza, number>(VARIABLES_CONFIANZA.map((v) => [v, 0]))
  for (const i of ventana) {
    if (i.variableConfianza) conteo.set(i.variableConfianza, (conteo.get(i.variableConfianza) ?? 0) + 1)
  }
  const variableMenosTrabajada = VARIABLES_CONFIANZA.reduce((menor, v) =>
    (conteo.get(v) ?? 0) < (conteo.get(menor) ?? 0) ? v : menor
  )

  const toca = `Toca contacto de ${VARIABLE_CONFIANZA_LABEL[variableMenosTrabajada]}`
  const siguienteAccion =
    etiqueta === 'en_riesgo'
      ? `Hay un incumplimiento sin compensar y pesa ${PESO_INCUMPLIMIENTO}x. ${toca}.`
      : diasSinContacto === null
        ? `Nunca se ha registrado contacto, contra una cadencia de ${cadenciaEsperada}d. ${toca}.`
        : etiqueta === 'sana'
          ? `Al día contra su cadencia de ${cadenciaEsperada}d. ${toca} para seguir construyendo.`
          : `${diasSinContacto}d sin contacto contra una cadencia de ${cadenciaEsperada}d. ${toca}.`

  return {
    tier,
    atributos,
    cadenciaEsperada,
    diasSinContacto,
    razonCadencia,
    contactosPositivos,
    incumplimientos,
    confianzaNeta,
    score,
    etiqueta,
    variableMenosTrabajada,
    siguienteAccion,
  }
}

export type InteraccionView = {
  id: string
  fecha: string
  tipo: string
  nota: string | null
  variableConfianza: VariableConfianza | null
  esIncumplimiento: boolean
}

export type StakeholderView = {
  id: string
  nombre: string
  puesto: string | null
  proyecto: string | null
  projectId: string | null
  poder: number
  interes: number
  legitimidad: boolean
  urgencia: boolean
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
  salud: SaludStakeholder
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
    // Salud de la relación, que es otra pregunta que la cadencia: se puede estar al
    // día en contactos y en riesgo por un incumplimiento, y al revés.
    frias: number
    enRiesgo: number
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
      // Sin `take`: el marcador de salud necesita la ventana de 90 días completa, no
      // las últimas 5. La ficha sigue mostrando 5 — eso se recorta abajo, no aquí.
      interacciones: { orderBy: { fecha: 'desc' } },
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
      legitimidad: s.legitimidad,
      urgencia: s.urgencia,
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
      salud: saludDe(s, s.interacciones, hoy),
      interacciones: s.interacciones.slice(0, 5).map((i) => ({
        id: i.id,
        fecha: iso(i.fecha),
        tipo: i.tipo,
        nota: i.nota,
        variableConfianza: i.variableConfianza,
        esIncumplimiento: i.esIncumplimiento,
      })),
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
      frias: stakeholders.filter((s) => s.salud.etiqueta === 'fria').length,
      enRiesgo: stakeholders.filter((s) => s.salud.etiqueta === 'en_riesgo').length,
    },
  }
}
