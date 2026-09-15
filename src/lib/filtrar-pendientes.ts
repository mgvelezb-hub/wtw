// Filtrado de la bandeja. Aritmética pura, sin React ni DOM — misma separación
// que `semana/lienzo.ts` y `lib/menu-geometria.ts`.
//
// Existe porque una bandeja de 33 tareas repartidas en 9 proyectos deja de ser
// una lista y pasa a ser un pajar: para agendar lo de Cuervo hay que leerlo todo.
// Filtrar por proyecto con un toque es lo que la vuelve utilizable en el iPad.

export type Pendiente = { id: string; titulo: string; proyecto: string | null }

/** Etiqueta de los que no cuelgan de ningún proyecto. */
export const SIN_PROYECTO = 'Sin proyecto'

export type GrupoProyecto = { proyecto: string; cuantas: number }

// Ordenados por cantidad y, a igualdad, alfabéticamente: los proyectos con más
// trabajo pendiente quedan al alcance del pulgar. "Sin proyecto" siempre al
// final — es el cajón de lo que todavía no se decidió, no un proyecto.
export function conteoPorProyecto(items: readonly Pendiente[]): GrupoProyecto[] {
  const cuenta = new Map<string, number>()
  for (const t of items) {
    const p = t.proyecto ?? SIN_PROYECTO
    cuenta.set(p, (cuenta.get(p) ?? 0) + 1)
  }
  return [...cuenta.entries()]
    .map(([proyecto, cuantas]) => ({ proyecto, cuantas }))
    .sort((a, b) => {
      if (a.proyecto === SIN_PROYECTO) return 1
      if (b.proyecto === SIN_PROYECTO) return -1
      return b.cuantas - a.cuantas || a.proyecto.localeCompare(b.proyecto, 'es')
    })
}

// Sin acentos y en minúsculas: "Auditoría" tiene que encontrarse tecleando
// "auditoria", que es como se escribe de prisa en una tableta.
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export function filtrarPendientes<T extends Pendiente>(
  items: readonly T[],
  filtro: { texto?: string; proyecto?: string | null }
): T[] {
  const texto = normalizar(filtro.texto?.trim() ?? '')
  // Cada palabra por separado y en cualquier orden: "matriz costos" encuentra
  // "Matriz y flujo de base de costos". Exigir la frase exacta obligaría a
  // recordar el título, que es justo lo que no pasa con 33 tareas.
  const palabras = texto === '' ? [] : texto.split(/\s+/)
  return items.filter((t) => {
    if (filtro.proyecto != null && (t.proyecto ?? SIN_PROYECTO) !== filtro.proyecto) return false
    if (palabras.length === 0) return true
    const heno = normalizar(`${t.titulo} ${t.proyecto ?? ''}`)
    return palabras.every((p) => heno.includes(p))
  })
}
