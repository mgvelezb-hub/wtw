import type { TipoTrabajo } from '@prisma/client'
import { TIPOS_TRABAJO } from './tipo-trabajo'

// Sugerir la CLASE DE TRABAJO de una tarea a partir de su título.
//
// El factor por clase solo calibra si las tareas traen clase, y etiquetar a mano
// una por una es exactamente la disciplina PMO que la app existe para no tener
// que hacer a mano. Así que se sugiere — nunca se aplica solo (ver la regla del
// repo: la IA propone, el humano dispone).
//
// Determinista a propósito, sin llamada al modelo: la sugerencia se calcula en
// cada tecleo del planeador y en lote sobre todo el backlog. Dos fuentes, en
// este orden:
//
//   1. El HISTÓRICO del propio usuario — si ya etiquetó "Deck del comité" como
//      deck, "Deck del comité de septiembre" es deck. Es la fuente buena: usa
//      su vocabulario, no el mío.
//   2. Palabras semilla, para el arranque en frío. Sin ellas un usuario nuevo
//      nunca recibe una sugerencia y nunca acumula histórico: el círculo se
//      cierra solo si algo lo abre.

// Palabras que aparecen en cualquier título y no discriminan nada.
const VACIAS = new Set([
  'de','del','la','el','los','las','para','con','por','y','o','a','al','en','un','una',
  'que','se','su','sus','lo','mas','más','sobre','como','este','esta','ese','esa',
])

export function tokens(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // sin acentos: "análisis" y "analisis" son la misma palabra
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !VACIAS.has(t))
}

// Semillas del arranque en frío. Cada palabra vale 1; la clase con más semillas
// gana. Son términos del vocabulario de consultoría de Mau, no genéricos.
const SEMILLAS: Record<TipoTrabajo, string[]> = {
  deck: ['deck', 'lamina', 'laminas', 'presentacion', 'slide', 'slides', 'ppt', 'powerpoint', 'storytelling'],
  analisis: ['analisis', 'analizar', 'modelo', 'modelar', 'excel', 'datos', 'calculo', 'calcular', 'python', 'query', 'costeo', 'costo', 'costos', 'escenario', 'simulacion', 'kpi', 'indicador', 'dashboard', 'tarifa', 'tarifas', 'presupuesto', 'validacion', 'validar', 'revisar', 'revision'],
  junta: ['junta', 'sesion', 'comite', 'reunion', 'llamada', 'workshop', 'ensayo', 'foro', 'touchpoint'],
  gestion: ['seguimiento', 'plan', 'planear', 'agenda', 'agendar', 'fechas', 'visitas', 'proponer', 'coordinar', 'coordinacion', 'sow', 'contrato', 'factura', 'facturar', 'cotizacion', 'administrativo'],
  comunicacion: ['correo', 'mail', 'minuta', 'status', 'reporte', 'responder', 'mensaje', 'nota', 'resumen', 'comunicar'],
  otro: [],
}

export type Sugerencia = {
  tipo: TipoTrabajo
  /** 'historico' = de una tarea que el usuario ya etiquetó; 'semilla' = del vocabulario base. */
  fuente: 'historico' | 'semilla'
  /** El título de la tarea que la justifica, cuando viene del histórico. */
  porque: string | null
}

export type TareaEtiquetada = { titulo: string; tipoTrabajo: TipoTrabajo }

// Solapamiento mínimo con una tarea del histórico para creerle. Con una sola
// palabra en común ("Liverpool") cualquier par de tareas del mismo cliente se
// parecería, y la sugerencia diría más del cliente que del tipo de trabajo.
const MIN_COMUNES = 2

export function sugerirClase(titulo: string, historico: TareaEtiquetada[] = []): Sugerencia | null {
  const t = new Set(tokens(titulo))
  if (t.size === 0) return null

  let mejor: { tipo: TipoTrabajo; comunes: number; titulo: string } | null = null
  for (const h of historico) {
    const comunes = tokens(h.titulo).filter((x) => t.has(x)).length
    if (comunes >= MIN_COMUNES && (!mejor || comunes > mejor.comunes)) {
      mejor = { tipo: h.tipoTrabajo, comunes, titulo: h.titulo }
    }
  }
  if (mejor) return { tipo: mejor.tipo, fuente: 'historico', porque: mejor.titulo }

  let ganadora: { tipo: TipoTrabajo; puntos: number } | null = null
  for (const tipo of TIPOS_TRABAJO) {
    const puntos = SEMILLAS[tipo].filter((s) => t.has(s)).length
    if (puntos > 0 && (!ganadora || puntos > ganadora.puntos)) ganadora = { tipo, puntos }
  }
  return ganadora ? { tipo: ganadora.tipo, fuente: 'semilla', porque: null } : null
}
