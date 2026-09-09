// Los tres temas de Reckon y la regla que decide cuál se pinta.
//
// Aritmética pura: sin React, sin DOM, sin Prisma — la misma separación que
// `semana/lienzo.ts` y `lib/menu-geometria.ts`. Quien la usa le pasa la hora y
// el estado del sistema; esto solo decide.
//
// Por qué son TRES y no dos. "Fuera de jornada" no es el oscuro reciclado: si
// se viera igual que el oscuro que tú elegiste, no diría nada. El oscuro
// deliberado conserva el sesgo teal de los neutros —el mismo sesgo del acento,
// según DESIGN.md—; el de fuera de jornada lo mueve a cálido. El suelo mismo te
// dice que el contexto cambió, sin gastar ámbar en superficies grandes, que
// rompería "ámbar solo advertencia".
export type Tema = 'claro' | 'oscuro' | 'fuera'

// Lo que el usuario elige en Ajustes. `auto` es el default.
export type Preferencia = 'claro' | 'oscuro' | 'auto'

export type Jornada = { inicioMin: number; finMin: number }

export type Contexto = {
  preferencia: Preferencia
  /** Lo que dice el sistema operativo ahora mismo. */
  sistemaOscuro: boolean
  /** Minutos desde medianoche, hora de México. */
  minutosAhora: number
  /** 0 = domingo. */
  diaSemana: number
  jornada: Jornada
  /** La casilla de Ajustes: el tema cambia al salir de la jornada. */
  avisarFueraDeJornada: boolean
}

// Fin de semana NO cuenta como fuera de jornada para el tema, aunque la señal
// de erosión sí lo cuente. Son preguntas distintas: la señal mide un patrón de
// 14 días y ahí el sábado es dato; el tema responde "¿estoy en horas de
// trabajo?", y un sábado entero en cálido dejaría de significar algo por
// saturación. En sábado y domingo manda el sistema.
export function estaFueraDeJornada(
  minutosAhora: number,
  diaSemana: number,
  jornada: Jornada
): boolean {
  if (diaSemana === 0 || diaSemana === 6) return false
  return minutosAhora < jornada.inicioMin || minutosAhora >= jornada.finMin
}

// El orden de las reglas es el argumento:
//
// 1. Una elección explícita gana sobre todo. Si fijaste "claro", son las 11 de
//    la noche y la app sigue clara: elegiste, y la app no te corrige.
// 2. Fuera de la jornada, el tercer tema — pero solo si lo pediste.
// 3. Si no, lo que diga el sistema.
export function resolverTema(ctx: Contexto): Tema {
  if (ctx.preferencia === 'claro') return 'claro'
  if (ctx.preferencia === 'oscuro') return 'oscuro'
  if (ctx.avisarFueraDeJornada && estaFueraDeJornada(ctx.minutosAhora, ctx.diaSemana, ctx.jornada)) {
    return 'fuera'
  }
  return ctx.sistemaOscuro ? 'oscuro' : 'claro'
}

// `color-scheme` no es decoración: sin él, iOS y Chrome pintan los controles de
// formulario con SU tema y el texto de un input queda casi invisible aunque el
// CSS nunca lo haya pedido. Es la razón por la que el tema claro lo declaraba
// fijo, y por la que ahora tiene que moverse con el tema.
export function colorScheme(tema: Tema): 'light' | 'dark' {
  return tema === 'claro' ? 'light' : 'dark'
}

export const CLAVE_PREFERENCIA = 'reckon.tema'
export const CLAVE_AVISO_JORNADA = 'reckon.tema-fuera-jornada'
/** El último tema resuelto, para pintarlo antes del primer frame y no parpadear. */
export const CLAVE_TEMA_RESUELTO = 'reckon.tema-resuelto'

export function esPreferencia(v: string | null): v is Preferencia {
  return v === 'claro' || v === 'oscuro' || v === 'auto'
}

export function esTema(v: string | null): v is Tema {
  return v === 'claro' || v === 'oscuro' || v === 'fuera'
}
