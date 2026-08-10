// Vive fuera de ai-actions.ts porque un archivo 'use server' solo puede exportar
// funciones async: exportar esta desde allá rompe el build de producción (tsc no
// lo detecta, `next build` sí).

// El modelo a veces envuelve el JSON en ```json ... ``` o lo precede de una
// frase, aunque el prompt lo prohíba. Recortamos al primer [ o { y parseamos.
// Si aun así no es JSON válido, es un fallo de la IA, no del usuario: se reporta
// y el paso queda editable a mano.
export function extraerJSON<T>(texto: string): T | null {
  const sinFences = texto.replace(/```(?:json)?/gi, '').trim()
  const inicio = sinFences.search(/[[{]/)
  if (inicio === -1) return null
  const abre = sinFences[inicio]
  const cierra = abre === '[' ? ']' : '}'
  const fin = sinFences.lastIndexOf(cierra)
  if (fin <= inicio) return null
  try {
    return JSON.parse(sinFences.slice(inicio, fin + 1)) as T
  } catch {
    return null
  }
}
