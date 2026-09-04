// Geometría pura del lienzo de tiempo. Sin Prisma y sin React a propósito: la
// importan el service (servidor), el board (cliente) y los tests, y ninguno de
// los tres debe arrastrar a los otros dos.
//
// Una hora del día vale 64 px. Todo lo demás —top, alto, la línea de "ahora",
// la hora que resulta de soltar un bloque a cierta altura— se deriva de esa
// constante, y se deriva SIEMPRE en minutos primero: el service posiciona en
// minutos desde el inicio de jornada y el cliente multiplica. Así la posición
// es testeable sin DOM.
export const PX_POR_HORA = 64
export const PX_POR_MIN = PX_POR_HORA / 60
export const MIN_ALTO_BLOQUE_PX = 28
// El drop dentro de una columna redondea a cuartos de hora. Las envolturas de
// `semana/actions.ts` pasan este mismo snap a `setBlockTimeAction` para que el
// server no re-redondee a 30 lo que aquí ya cayó en 15.
export const SNAP_MIN = 15

export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function fromMin(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Etiqueta de la columna de horas: "09" cuando la jornada arranca en punto (el
// caso normal), "09:30" cuando no. Mentir con "09" en una jornada que empieza
// 9:30 desalinearía todo lo que se lea contra esa columna.
export function etiquetaHora(min: number): string {
  const h = Math.floor(min / 60) % 24
  return min % 60 === 0 ? String(h).padStart(2, '0') : fromMin(min)
}

// Dónde vive un bloque en el lienzo:
//   grid  — cabe entero dentro de la jornada, se dibuja posicionado por hora
//   flex  — sin hora ("flex"), va a la franja de chips bajo su columna
//   fuera — tiene hora pero se sale de la jornada: NO se dibuja en el grid
//           (dibujarlo obligaría a estirar la rejilla hasta las 11pm por un
//           bloque, y escondería justo lo que hay que ver: que se salió)
export type Ubicacion = 'grid' | 'flex' | 'fuera'

export type Posicion = {
  ubicacion: Ubicacion
  /** Minutos desde el inicio de jornada. null si el bloque no va en el grid. */
  topMin: number | null
  /** Duración en minutos — de inicio/fin si son horas reales, si no del plan. */
  durMin: number
}

export function posicionarBloque(
  inicio: string,
  fin: string,
  planMin: number,
  jornadaInicioMin: number,
  jornadaFinMin: number,
  // Día sin jornada (sábado o domingo sin horario declarado): la hora existe,
  // pero ninguna hora de ese día está DENTRO de una jornada. Todo cae fuera —
  // es la misma regla de `carga-sostenible.fueraDeJornada`, y es el punto:
  // pintar el sábado 11:00 dentro del grid diría que ese trabajo fue normal.
  sinJornada = false
): Posicion {
  if (inicio === 'flex' || fin === 'flex') {
    return { ubicacion: 'flex', topMin: null, durMin: planMin }
  }
  const inicioMin = toMin(inicio)
  const finMin = toMin(fin)
  const durMin = finMin > inicioMin ? finMin - inicioMin : planMin
  if (sinJornada) {
    return { ubicacion: 'fuera', topMin: null, durMin }
  }
  if (inicioMin < jornadaInicioMin || inicioMin + durMin > jornadaFinMin) {
    return { ubicacion: 'fuera', topMin: null, durMin }
  }
  return { ubicacion: 'grid', topMin: inicioMin - jornadaInicioMin, durMin }
}

// Altura de la columna con la Y del cursor → hora redondeada a SNAP_MIN,
// acotada a la jornada. Es lo único que traduce píxeles a tiempo en el drop.
export function horaDesdeOffset(offsetY: number, jornadaInicioMin: number, jornadaFinMin: number): string {
  const crudo = jornadaInicioMin + offsetY / PX_POR_MIN
  const snap = Math.round(crudo / SNAP_MIN) * SNAP_MIN
  const tope = Math.max(jornadaInicioMin, jornadaFinMin - SNAP_MIN)
  return fromMin(Math.min(Math.max(snap, jornadaInicioMin), tope))
}

// El resize por la esquina va en pasos de media hora — la unidad de agenda de
// /dia — aunque el drop use cuartos: mover un bloque es fino, estirarlo es
// compromiso de tiempo y se piensa en bloques de 30.
export const RESIZE_SNAP_MIN = 30

// Delta de píxeles arrastrados desde la esquina inferior → nueva duración,
// redondeada a RESIZE_SNAP_MIN y nunca por debajo de un paso.
export function durDesdeResize(durMinInicial: number, deltaPx: number): number {
  const cruda = durMinInicial + deltaPx / PX_POR_MIN
  const snap = Math.round(cruda / RESIZE_SNAP_MIN) * RESIZE_SNAP_MIN
  return Math.max(RESIZE_SNAP_MIN, snap)
}

// ── Carriles: repartir el ancho entre bloques que se traslapan ───────────────
//
// El lienzo pintaba todos los bloques de un día con `absolute inset-x-1`, o sea
// al ancho completo de la columna, así que dos que compartían hora se apilaban
// uno sobre otro y el texto se imprimía sobre el texto. En un lunes con tres
// colisiones no se podía leer ninguna de las actividades — en la pantalla que
// existe para responder "¿cabe la semana?".
//
// El reparto es por GRUPO de colisión, no por día: dos que se enciman en la
// mañana no adelgazan al de la tarde que no colisiona con nadie. Y un carril se
// reutiliza en cuanto el bloque que lo ocupaba terminó, así que una sola
// colisión no parte el día entero en tres columnas.
//
// Aritmética pura, como el resto de este módulo: se prueba sin DOM.

export type Tramo = { id: string; topMin: number; durMin: number }
export type Carril = { carril: number; carriles: number }

export function repartirCarriles(tramos: Tramo[]): Map<string, Carril> {
  const orden = [...tramos].sort((a, b) => a.topMin - b.topMin || b.durMin - a.durMin)
  const salida = new Map<string, Carril>()

  // Un grupo es una cadena de traslapes: se corta cuando empieza un bloque
  // después de que TODO lo anterior del grupo terminó. Dentro del grupo, cada
  // uno va al primer carril cuyo último ocupante ya acabó.
  let grupo: Array<{ id: string; carril: number }> = []
  let finDeCarril: number[] = []
  let finDelGrupo = -1

  function cerrarGrupo(): void {
    const carriles = finDeCarril.length
    for (const g of grupo) salida.set(g.id, { carril: g.carril, carriles })
    grupo = []
    finDeCarril = []
    finDelGrupo = -1
  }

  for (const t of orden) {
    const fin = t.topMin + t.durMin
    // Tocarse de punta a punta (09:00–10:00 y 10:00–11:00) NO es traslape:
    // tratarlo como colisión partiría el día de quien agenda pegado, que es lo
    // normal.
    if (grupo.length > 0 && t.topMin >= finDelGrupo) cerrarGrupo()

    let carril = finDeCarril.findIndex((f) => f <= t.topMin)
    if (carril === -1) {
      carril = finDeCarril.length
      finDeCarril.push(fin)
    } else {
      finDeCarril[carril] = fin
    }

    grupo.push({ id: t.id, carril })
    finDelGrupo = Math.max(finDelGrupo, fin)
  }
  if (grupo.length > 0) cerrarGrupo()

  return salida
}
