import type { DesvioCausa } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { isoWeekOf } from '@/lib/dates'
import { senalesSobrecarga, type NivelCarga } from '@/lib/carga-sostenible'
import { CAUSA_LABEL, getPatronDesvios } from '@/app/(app)/cierre/service'
import { getStrandedBlocks } from '@/app/(app)/dia/service'
import {
  ETIQUETA_SALUD_LABEL,
  VARIABLE_CONFIANZA_LABEL,
  getMapaStakeholders,
  type EtiquetaSalud,
} from '@/app/(app)/stakeholders/service'

// Briefing matutino — el único momento proactivo del día.
//
// El patrón que sí funciona (Fase 7, §proactividad): la app interrumpe UNA vez,
// en un momento ritual predecible —abrir /dia por la mañana— y no otra. Un
// sistema que avisa cuando le parece se apaga a la semana; uno que avisa siempre
// en el mismo lugar se lee como parte del arranque.
//
// Tres decisiones que definen esta pieza:
//
// 1. **Sin IA.** Todo lo que el briefing dice ya está en la base: el primer
//    bloque, el cierre de ayer, los arrastres, la salud de los stakeholders, los
//    wins sin bloques y el semáforo de carga. Una llamada al modelo aquí no
//    agregaría información — agregaría 2-4 s de latencia a la ruta más usada de
//    la app y un modo de fallo nuevo (sin API key, sin briefing).
// 2. **Sin cron ni agente nocturno.** Se calcula server-side al cargar /dia.
//    No hay nada que mantener corriendo, y el briefing nunca está rancio.
// 3. **Cada sección es null si no aplica.** El briefing solo dice lo que vale la
//    pena; una card que siempre trae seis líneas —tres de ellas "todo bien"— es
//    ruido que se aprende a saltar. Si no hay nada, no se muestra la card.
//
// `hoy` se inyecta siempre (nunca `new Date()` adentro): el cálculo tiene que ser
// determinista para poder probarlo, igual que `senalesSobrecarga` y `saludDe`.

// Hasta dónde mirar atrás buscando el último cierre. Con 3 días, el lunes
// alcanza el cierre del viernes — que es justo el día cuyo desvío importa
// arrastrar al arranque de la semana.
const DIAS_ATRAS_CIERRE = 3

// Dos stakeholders, no la lista completa. El briefing no sustituye a
// /stakeholders: nombra a quien tocaría hoy y ahí se acaba.
const MAX_STAKEHOLDERS_FRIOS = 2

export type BriefingPrimerBloque = {
  // "09:00" o "flex" — tal cual vive en Block.inicio.
  hora: string
  titulo: string
  tipo: string
}

export type BriefingCierreAyer = {
  fecha: string
  // Falso cuando el último cierre no es el de ayer (típicamente un lunes
  // mirando el viernes). La UI cambia "Ayer" por el día de la semana.
  esAyer: boolean
  causa: DesvioCausa
  label: string
  minutos: number
}

export type BriefingStakeholderFrio = {
  id: string
  nombre: string
  etiqueta: EtiquetaSalud
  etiquetaLabel: string
  // null = nunca se ha registrado contacto, que es peor que cualquier número.
  diasSinContacto: number | null
  // La variable de la Trust Equation menos trabajada — el "qué hacer", no solo
  // el "está frío".
  tocaContactoDe: string
  siguienteAccion: string
}

export type BriefingWinEnRiesgo = {
  posicion: number
  titulo: string
  siEntonces: string | null
}

export type BriefingSobrecarga = {
  nivel: Exclude<NivelCarga, 'verde'>
  detalle: string
}

export type Briefing = {
  fecha: string
  primerBloque: BriefingPrimerBloque | null
  seMovioAyer: BriefingCierreAyer | null
  // null en vez de 0: "cero arrastradas" no es una línea que valga la pena leer.
  arrastradas: number | null
  stakeholdersFrios: BriefingStakeholderFrio[] | null
  winEnRiesgo: BriefingWinEnRiesgo | null
  sobrecarga: BriefingSobrecarga | null
  // Atajo para la UI y para los tests: si es false, no hay card que mostrar.
  hayContenido: boolean
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function diasAntes(d: Date, n: number): Date {
  const x = new Date(d)
  x.setUTCDate(x.getUTCDate() - n)
  x.setUTCHours(0, 0, 0, 0)
  return x
}

// ── Primer bloque pendiente ──────────────────────────────────────────────────
//
// Consulta directa a Block en vez de reusar `getDayBlocks`: ese arma la vista
// completa del día (cronómetro corriendo, juntas de Outlook, minutas ya
// capturadas) y aquí solo hacen falta hora y título. El briefing corre en la
// ruta más usada de la app — no vale la pena pagar cuatro consultas más por dos
// strings.
//
// Los descansos quedan fuera: la comida está en el plan, pero no es con lo que
// se arranca. `orderBy: inicio` deja los "flex" al final por orden lexicográfico
// ('f' > los dígitos), que es exactamente lo que se quiere: un bloque con hora
// gana a uno sin ella.
async function primerBloquePendiente(userId: string, hoyStr: string): Promise<BriefingPrimerBloque | null> {
  const blocks = await prisma.block.findMany({
    where: { fecha: new Date(hoyStr), week: { userId }, tipo: { not: 'descanso' } },
    include: { task: { select: { estatus: true } } },
    orderBy: [{ inicio: 'asc' }, { orden: 'asc' }],
  })

  // Un bloque con tarea se cierra desde la tarea (`estatus`), uno sin ella desde
  // el propio bloque (`done`) — misma regla que usa `getDayBlocks`.
  const pendiente = blocks.find((b) => (b.task ? b.task.estatus !== 'done' : !b.done))
  if (!pendiente) return null

  return { hora: pendiente.inicio, titulo: pendiente.titulo, tipo: pendiente.tipo }
}

// ── Qué movió el plan en el último cierre ────────────────────────────────────
//
// Reusa `getPatronDesvios` sobre un solo día en vez de recalcular la causa
// dominante: hay UNA definición de "qué causa domina" y vive en /cierre. Aquí
// solo se elige el día.
async function cierreQueMovioElPlan(userId: string, hoy: Date): Promise<BriefingCierreAyer | null> {
  const ayer = diasAntes(hoy, 1)
  const cierre = await prisma.dayReconciliation.findFirst({
    where: {
      userId,
      fecha: { gte: diasAntes(hoy, DIAS_ATRAS_CIERRE), lte: ayer },
      // Sin desvíos no hay nada que contar: el día se cerró y salió como estaba
      // planeado, que no es noticia.
      desvios: { some: {} },
    },
    orderBy: { fecha: 'desc' },
    select: { fecha: true },
  })
  if (!cierre) return null

  const fecha = iso(cierre.fecha)
  const patron = await getPatronDesvios(userId, fecha, fecha)
  if (!patron.dominante) return null

  const dominante = patron.porCausa.find((c) => c.causa === patron.dominante)!
  return {
    fecha,
    esAyer: fecha === iso(ayer),
    causa: dominante.causa,
    label: CAUSA_LABEL[dominante.causa],
    minutos: dominante.minutos,
  }
}

// ── Stakeholders que se están enfriando ──────────────────────────────────────
//
// Reusa `getMapaStakeholders`, que ya corre `saludDe` sobre la ventana completa
// de interacciones. Duplicar el marcador aquí sería tener dos definiciones de
// "relación fría" que se desincronizan en el primer cambio de umbral.
//
// Orden: primero en riesgo (hay un incumplimiento sin compensar — la cadencia no
// lo repara), luego el score más bajo, y como desempate el de más poder.
const PRIORIDAD_ETIQUETA: Record<string, number> = { en_riesgo: 0, fria: 1 }

async function stakeholdersFrios(userId: string, hoy: Date): Promise<BriefingStakeholderFrio[] | null> {
  const mapa = await getMapaStakeholders(userId, hoy)

  const frios = mapa.stakeholders
    .filter((s) => s.salud.etiqueta === 'fria' || s.salud.etiqueta === 'en_riesgo')
    .sort((a, b) => {
      const pa = PRIORIDAD_ETIQUETA[a.salud.etiqueta]
      const pb = PRIORIDAD_ETIQUETA[b.salud.etiqueta]
      if (pa !== pb) return pa - pb
      if (a.salud.score !== b.salud.score) return a.salud.score - b.salud.score
      return b.poder - a.poder
    })
    .slice(0, MAX_STAKEHOLDERS_FRIOS)

  if (frios.length === 0) return null

  return frios.map((s) => ({
    id: s.id,
    nombre: s.nombre,
    etiqueta: s.salud.etiqueta,
    etiquetaLabel: ETIQUETA_SALUD_LABEL[s.salud.etiqueta],
    diasSinContacto: s.salud.diasSinContacto,
    tocaContactoDe: VARIABLE_CONFIANZA_LABEL[s.salud.variableMenosTrabajada],
    siguienteAccion: s.salud.siguienteAccion,
  }))
}

// ── El win que se va a quedar sin semana ─────────────────────────────────────
//
// Heurística deliberadamente tonta: un win sin NINGÚN bloque de aquí al viernes
// no se va a lograr solo. No mide avance ni porcentajes —no hay dato para eso—,
// mide si queda tiempo reservado. Lo que devuelve no es una alarma sino el
// si-entonces del win, que es justo lo que hay que repasar antes de que el
// obstáculo llegue.
//
// Solo se evalúan los `pendiente`: un win ya marcado logrado no necesita
// bloques, y uno marcado fallido ya se decidió — repetírselo por la mañana es
// regaño, no dato.
async function winEnRiesgo(userId: string, hoy: Date, hoyStr: string): Promise<BriefingWinEnRiesgo | null> {
  const week = await prisma.week.findUnique({
    where: { userId_isoWeek: { userId, isoWeek: isoWeekOf(hoy) } },
    select: {
      id: true,
      wins: {
        where: { estatus: 'pendiente' },
        orderBy: { posicion: 'asc' },
        select: { id: true, posicion: true, titulo: true, siEntonces: true },
      },
    },
  })
  if (!week || week.wins.length === 0) return null

  const winIds = week.wins.map((w) => w.id)
  // Hoy cuenta como "restante": el bloque de las 4 pm todavía no ocurrió.
  const bloques = await prisma.block.findMany({
    where: { weekId: week.id, fecha: { gte: new Date(hoyStr) }, task: { winId: { in: winIds } } },
    select: { task: { select: { winId: true } } },
  })
  const conBloques = new Set(bloques.map((b) => b.task?.winId).filter((id): id is string => id !== null && id !== undefined))

  const enRiesgo = week.wins.find((w) => !conBloques.has(w.id))
  if (!enRiesgo) return null

  return { posicion: enRiesgo.posicion, titulo: enRiesgo.titulo, siEntonces: enRiesgo.siEntonces }
}

// ── Semáforo de carga ────────────────────────────────────────────────────────
//
// Verde no se dice. Es la misma regla de calm tech que ya sigue el chip del
// header: la ausencia de alarma no necesita anuncio.
async function sobrecargaSiAplica(userId: string, hoy: Date): Promise<BriefingSobrecarga | null> {
  const r = await senalesSobrecarga(userId, hoy)
  if (r.nivel === 'verde') return null
  return {
    nivel: r.nivel,
    detalle: r.senales
      .filter((s) => s.activa)
      .map((s) => s.detalle)
      .join(' '),
  }
}

export async function briefingDe(userId: string, hoy: Date): Promise<Briefing> {
  const hoyStr = iso(hoy)

  const [primerBloque, seMovioAyer, stranded, frios, win, sobrecarga] = await Promise.all([
    primerBloquePendiente(userId, hoyStr),
    cierreQueMovioElPlan(userId, hoy),
    // Misma fuente que el banner de arrastradas del tablero — si cambia el
    // criterio de "viene de días anteriores", cambia en un solo lugar.
    getStrandedBlocks(userId, hoyStr),
    stakeholdersFrios(userId, hoy),
    winEnRiesgo(userId, hoy, hoyStr),
    sobrecargaSiAplica(userId, hoy),
  ])

  const arrastradas = stranded.length > 0 ? stranded.length : null

  return {
    fecha: hoyStr,
    primerBloque,
    seMovioAyer,
    arrastradas,
    stakeholdersFrios: frios,
    winEnRiesgo: win,
    sobrecarga,
    hayContenido:
      primerBloque !== null ||
      seMovioAyer !== null ||
      arrastradas !== null ||
      frios !== null ||
      win !== null ||
      sobrecarga !== null,
  }
}
