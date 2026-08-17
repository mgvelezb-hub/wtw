// Convertir la defensa de un riesgo del pre-mortem en una actividad planeable.
//
// Hasta ahora la defensa era prosa de solo lectura: se generaba, se guardaba en
// WeekRisk.defensa y nadie la ejecutaba. Varias defensas describen literalmente
// una actividad con su duración ("agenda 30 min exclusivos para probar la
// conexión aislada"), así que el trabajo ya estaba especificado — solo no había
// forma de meterlo a la semana.
//
// El modelo ahora devuelve `medida` estructurada, pero estos helpers existen
// igual por dos razones: un borrador guardado ANTES de este cambio no la trae, y
// el modelo puede omitirla. En ambos casos se deriva de la prosa en vez de
// dejar la fila sin acción.

export type Medida = { titulo: string; estimadoMin: number }

// Duración por defecto cuando la defensa no dice ninguna. 30 min es deliberado:
// suficiente para una verificación acotada y lo bastante chico para que, si está
// mal, se note al ver la carga en vez de distorsionarla en silencio.
const DEFAULT_MIN = 30
const MAX_TITULO = 72

// "agenda 30 min", "Define en 10 minutos", "2 h", "1.5 horas"
const RE_MINUTOS = /(\d+(?:[.,]\d+)?)\s*(min|minutos?|h|hrs?|horas?)\b/i

export function minutosDeTexto(texto: string): number | null {
  const m = RE_MINUTOS.exec(texto)
  if (!m) return null

  const n = Number(m[1].replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null

  const enHoras = /^h/i.test(m[2])
  const min = Math.round(enHoras ? n * 60 : n)

  // Un tope alto descarta números que no eran duraciones ("perder las horas en
  // debug", "$32.3M en 8 horas de…") sin tener que entender la frase.
  return min >= 5 && min <= 8 * 60 ? min : null
}

// Primer imperativo accionable de la defensa. Se corta en el primer límite de
// oración y luego a MAX_TITULO en un espacio, para no partir palabras.
export function tituloDeDefensa(defensa: string): string {
  const limpio = defensa.replace(/^[\s→·—-]+/, '').trim()
  if (limpio === '') return 'Medida del pre-mortem'

  const oracion = limpio.split(/(?<=[.;])\s+/)[0].replace(/[.;]+$/, '')
  if (oracion.length <= MAX_TITULO) return oracion

  const corte = oracion.lastIndexOf(' ', MAX_TITULO)
  return `${oracion.slice(0, corte > 20 ? corte : MAX_TITULO).trim()}…`
}

// La medida efectiva de un riesgo: la que dio el modelo si vino bien formada, o
// la derivada de la prosa. Nunca devuelve null — un riesgo sin acción posible es
// justo lo que este cambio elimina.
export function medidaDe(riesgo: { defensa: string; medida?: Partial<Medida> | null }): Medida {
  const dada = riesgo.medida
  const titulo = typeof dada?.titulo === 'string' && dada.titulo.trim() !== '' ? dada.titulo.trim() : tituloDeDefensa(riesgo.defensa)

  const min =
    typeof dada?.estimadoMin === 'number' && dada.estimadoMin > 0
      ? Math.round(dada.estimadoMin)
      : (minutosDeTexto(riesgo.defensa) ?? DEFAULT_MIN)

  return { titulo: titulo.slice(0, 140), estimadoMin: Math.min(min, 8 * 60) }
}

// Prefijo de `ref` de las medidas dentro del draft del planeador. Sirve para
// saber si una medida ya se agregó sin guardar estado paralelo: la fuente de
// verdad es la lista de items, no un set aparte que se puede desincronizar.
export function refDeMedida(indice: number): string {
  return `pm${indice}`
}
