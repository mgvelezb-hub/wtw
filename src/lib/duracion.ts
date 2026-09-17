// Los tres formatos de tiempo de la app, en un solo lugar.
//
// Había CINCO `horas()` repartidas en cinco archivos con TRES formatos, y el
// daño no era la duplicación: era que dos de ellos producen la misma forma con
// significados distintos. El cronómetro imprimía `20:00` para veinte minutos
// (M:SS) justo encima de un plan que imprimía `0:30` para media hora (H:MM), así
// que la fila se leía "planeé 30 minutos y me tardé 20 horas".
//
// La regla que lo cierra: **la cantidad de segmentos dice qué estás leyendo.**
//
//   tres → `0:20:00`  cronómetro en vivo, los segundos corren
//   dos  → `0:20`     duración H:MM, para comparar en columna
//   cero → `20m`      prosa, para meter en una frase o junto a horas de reloj
//
// Por eso `reloj()` SIEMPRE lleva la hora aunque sea cero: es lo que lo vuelve
// imposible de confundir con una duración.

/** Cronómetro en vivo: `0:20:00`. Tres segmentos, siempre. */
export function reloj(totalSegundos: number): string {
  const t = Math.max(0, Math.floor(totalSegundos))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * Duración en columna: `0:20`, `4:00`. Dos segmentos, alinea con tabular-nums.
 *
 * Un tiempo medido de menos de un minuto NO se redondea a `0:00`: eso diría que
 * no se midió nada, y la diferencia entre "no medí" y "medí poco" es justo la
 * que el factor de realismo necesita. Sale como `<1m`.
 */
export function duracion(min: number): string {
  if (min > 0 && min < 1) return '<1m'
  const total = Math.max(0, Math.round(min))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Duración en prosa: `45m`, `2h`, `1h 30m`.
 *
 * Es la forma obligatoria DENTRO del lienzo de la semana, cuyo eje son horas del
 * reloj: ahí un `1:30` se lee como la una y media, no como hora y media.
 */
export function horasTexto(min: number): string {
  const total = Math.max(0, Math.round(min))
  if (total === 0) return '0m'
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** Horas con un decimal para totales grandes: `27.3h`. */
export function horasDecimal(min: number): string {
  const h = min / 60
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`
}
