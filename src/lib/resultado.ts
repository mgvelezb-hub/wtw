// Resultado de una Server Action que puede fallar por una razón que el usuario
// puede corregir.
//
// Next redacta los mensajes de las excepciones que salen de una Server Action en
// producción: un `throw new Error('la evidencia necesita una nota')` llega a la
// pantalla como una cadena opaca en inglés. El mensaje existía, estaba en
// español y bien escrito, y el usuario nunca lo veía.
//
// Los services siguen lanzando: los comparte la capa Bearer PAT de `/api/v1`,
// donde una excepción sí es la forma correcta de mapear a un status HTTP. Lo que
// cambia es la frontera con la UI, que es la que tiene que devolver, no lanzar.
export type Resultado<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string }

export async function intentar<T extends object>(
  fn: () => Promise<T>,
  fallback = 'No se pudo completar la operación.'
): Promise<Resultado<T>> {
  try {
    return { ok: true, ...(await fn()) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : fallback }
  }
}
