import type { CapacidadSemana } from '@/app/api/v1/capacity/service'

// Aritmética de carga contra capacidad, sin Prisma y sin React — la misma
// separación que `semana/lienzo.ts` y `lib/menu-geometria.ts`.
//
// Vive fuera de `service.ts` por una razón de build, no de estética: el wizard
// es un Client Component y necesita estas dos funciones para pintar el balance
// en los pasos 3 y 4. Importarlas de `service.ts` mete a `@/lib/avisos` —que
// lleva `import 'server-only'`— en el grafo del cliente, y `next build` falla
// aunque `next dev` y los tests pasen sin quejarse.

// Carga vs. capacidad: el único número que decide si la semana es realista.
export type Balance = {
  cargaMin: number
  planeableMin: number
  colchonMin: number
  sobrecargado: boolean
}

export function balance(cargaAjustadaMin: number, capacidad: CapacidadSemana): Balance {
  const planeableMin = Math.round(capacidad.trabajablePlaneable * 60)
  return {
    cargaMin: cargaAjustadaMin,
    planeableMin,
    colchonMin: planeableMin - cargaAjustadaMin,
    sobrecargado: cargaAjustadaMin > planeableMin,
  }
}

// ── El buffer deja de ser decorativo ────────────────────────────────────────
//
// `trabajablePlaneable` ya es (trabajable − buffer%): la resta del buffer ocurre
// en capacityForWeek. Lo que faltaba era la CONSECUENCIA — hasta ahora el
// planeador pintaba la sobrecarga en rojo y de todas formas dejaba crear la
// semana, así que el buffer era una cifra en Settings, no una restricción.
//
// La regla: la carga aceptada no puede exceder lo planeable. No es prudencia
// genérica; una semana planeada al 100% no deja margen para lo no previsto y el
// desbordamiento se paga en la semana siguiente (Sonnentag: la recuperación es
// condición del desempeño sostenido, no su recompensa).
export type ValidacionCarga = {
  ok: boolean
  cargaMin: number
  planeableMin: number
  excedenteMin: number
  mensaje: string | null
}

function horasTexto(min: number): string {
  const h = min / 60
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`
}

export function validarCarga(cargaAjustadaMin: number, capacidad: CapacidadSemana): ValidacionCarga {
  const bal = balance(cargaAjustadaMin, capacidad)
  const excedenteMin = Math.max(0, bal.cargaMin - bal.planeableMin)
  return {
    ok: excedenteMin === 0,
    cargaMin: bal.cargaMin,
    planeableMin: bal.planeableMin,
    excedenteMin,
    // Tono de calibración, no de regaño: dice qué pasa y cuánto hay que mover.
    mensaje: mensajeDeCarga(excedenteMin, bal.planeableMin),
  }
}

function mensajeDeCarga(excedenteMin: number, planeableMin: number): string | null {
  if (excedenteMin === 0) return null
  // Sin tiempo planeable, "recorta 12h" es un callejón sin salida: no hay
  // recorte que alcance porque el problema no es la carga, es el calendario.
  // Decir qué palanca sí existe es la diferencia entre una compuerta y un muro.
  if (planeableMin <= 0) {
    return 'Esta semana no tiene tiempo planeable: el calendario la ocupa completa. Libera juntas, o ajusta tu jornada y tu buffer en Settings antes de planear.'
  }
  return `El plan al 100% degrada la capacidad de la semana siguiente — recorta ${horasTexto(excedenteMin)} o muévelas a backlog.`
}
