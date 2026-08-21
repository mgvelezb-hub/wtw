// Normalización de lo que devuelve la IA al inferir evidencia desde una minuta.
// Vive fuera de inferir-evidencia.ts (que importa prisma y el SDK) para poder
// probarse sin base ni sesión — mismo molde que
// src/app/(app)/dia/normalizar-clasificacion.ts.
//
// La regla del feature: la IA PROPONE, Mau confirma con un tap. Eso invierte el
// costo de los errores. Una sugerencia inventada cuesta más que una perdida:
// el reactivo alimenta la rúbrica que decide una promoción, y confirmar es tan
// barato que Mau puede aceptar sin leer con cuidado. Por eso toda la defensa es
// restrictiva — ante la duda se descarta, nunca se rellena.

export type ConfianzaEvidencia = 'alta' | 'media'

export type SugerenciaEvidencia = {
  competencyId: string
  // El episodio concreto, en 1-2 líneas. Es lo que se guarda en Evidence.nota.
  nota: string
  confianza: ConfianzaEvidencia
}

// Tres es el tope del prompt y también el tope duro aquí: una junta que "demuestra"
// cinco reactivos no es una junta excepcional, es un modelo complaciente.
export const MAX_SUGERENCIAS = 3

const CONFIANZAS: ConfianzaEvidencia[] = ['alta', 'media']

export function normalizarSugerencias(
  crudo: unknown,
  competenciasValidas: Iterable<string>
): SugerenciaEvidencia[] {
  if (!Array.isArray(crudo)) return []

  const validas = new Set(competenciasValidas)
  const vistas = new Set<string>()
  const salida: SugerenciaEvidencia[] = []

  for (const entrada of crudo) {
    if (salida.length >= MAX_SUGERENCIAS) break
    if (typeof entrada !== 'object' || entrada === null) continue

    const item = entrada as Record<string, unknown>

    // Un competencyId inventado NO cae a un default: se descarta. A diferencia
    // de un tipo de item de minuta, aquí no existe un "cajón neutro" —
    // adivinar el reactivo es acreditar el trabajo en la casilla equivocada, y
    // además reventaría la FK de Evidence.
    const competencyId = typeof item.competencyId === 'string' ? item.competencyId.trim() : ''
    if (!validas.has(competencyId)) continue

    // Un reactivo repetido en la misma minuta se queda con la primera pasada:
    // dos evidencias del mismo episodio inflan la cobertura sin agregar nada.
    if (vistas.has(competencyId)) continue

    // Sin nota no hay evidencia: el valor está en el episodio, no en la marca.
    // Los saltos de línea se colapsan porque la nota se edita en un campo de una
    // línea en la UI, y porque Evidence.nota se lee en listas compactas.
    const nota = typeof item.nota === 'string' ? item.nota.replace(/\s+/g, ' ').trim() : ''
    if (nota === '') continue

    vistas.add(competencyId)
    salida.push({
      competencyId,
      nota,
      // Una confianza inventada cae a 'media', nunca a 'alta': el default no
      // debe empujar a Mau a confirmar sin leer.
      confianza: CONFIANZAS.includes(item.confianza as ConfianzaEvidencia)
        ? (item.confianza as ConfianzaEvidencia)
        : 'media',
    })
  }

  return salida
}
