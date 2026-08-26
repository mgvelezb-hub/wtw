import type { Prisma } from '@prisma/client'

// Delegar de verdad es distinto de marcar `delegable`:
//
//   delegable  = "la hice YO y debió hacerla un perfil más junior". Bitácora
//                para el caso de negocio ante VP. La tarea sigue siendo de Mau
//                y sigue pesando en su carga, porque de verdad la trabajó.
//   delegada   = "la hace alguien más". Sale de la carga de Mau, pero NO
//                desaparece: sigue visible en el día como compromiso de un
//                tercero, con nombre, porque Mike y Memo trabajan entregables
//                suyos y perderles el rastro es peor que la carga sobrante.
//
// Las dos alimentan Carrera desde lados opuestos: la primera es evidencia de que
// falta equipo, la segunda de que ya opera como gerente.
//
// El factor de realismo se protege solo: filtra `estatus: 'done'` y descarta lo
// que no tenga tiempo medido, y una tarea delegada nunca es ninguna de las dos
// cosas. El test lo fija de todos modos — que hoy sea cierto por construcción no
// impide que mañana alguien cuente las delegadas como terminadas.

/**
 * Los bloques que SÍ cuentan para la carga. Un bloque sin tarea (junta, hito,
 * descanso) siempre cuenta; uno con tarea cuenta salvo que esté delegada.
 *
 * Vive aquí y no repetido en cada servicio porque la carga se suma en cuatro
 * lugares distintos —el día, la semana, el semáforo JD-R y la capacidad— y si el
 * filtro se copia, tarde o temprano uno se queda atrás y las cifras se
 * contradicen sin que nada avise.
 */
export const BLOQUE_CUENTA_CARGA: Prisma.BlockWhereInput = {
  OR: [{ taskId: null }, { task: { estatus: { not: 'delegada' } } }],
}

/** Versión en memoria del mismo predicado, para listas ya traídas de la base. */
export function cuentaCarga(b: { task?: { estatus: string } | null }): boolean {
  return b.task?.estatus !== 'delegada'
}
