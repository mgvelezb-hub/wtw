// Cuándo una medición sirve para calibrar.
//
// Un cronómetro que no se prendió no deja un hueco: deja un número chiquito. Una
// tarea de 125 min planeados con 1 min medido no dice "fui rapidísimo", dice
// "no medí" — y metida en el factor lo empuja hacia ABAJO, que es exactamente al
// revés del sesgo que el factor existe para corregir.
//
// El umbral no es nuevo: lo usa el recap del planeador desde que se escribió
// ("32 min medidos contra 826 planeados no es velocidad"). Vive aquí para que
// haya UN solo número y no dos que se puedan separar sin que nadie lo note.
export const PROPORCION_MINIMA_MEDIDA = 0.25

/** true si lo medido alcanza para comparar contra lo planeado. */
export function medicionUsable(medidoMin: number, planeadoMin: number): boolean {
  if (medidoMin <= 0 || planeadoMin <= 0) return false
  return medidoMin / planeadoMin >= PROPORCION_MINIMA_MEDIDA
}
