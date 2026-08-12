// Rutas archivadas.
//
// El council de 2026-08-10 auditó el lado del insumo ("¿el dato es real?") y
// mandó archivar la superficie que no ha cambiado ninguna decisión real. La
// regla del plan: celda vacía en la tabla de Fase 0 = se archiva detrás de un
// flag, no se itera. Archivar cuesta solo ego; todos tratamos "matar" como la
// opción difícil cuando es la gratis.
//
// Se archiva detrás de un flag y NO se borra el código a propósito: /roi vuelve
// a servir el día que exista una decisión de precio que dependa de él, y ese día
// revivirlo debe costar una variable de entorno, no una reimplementación.
//
// Ver docs/plans/2026-08-10-alineacion-council.md §Fase 2.

const ARCHIVADAS_POR_DEFECTO = ['roi'] as const

export type RutaArchivable = (typeof ARCHIVADAS_POR_DEFECTO)[number]

function revividas(): string[] {
  return (process.env.WTW_RUTAS_ACTIVAS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function rutaArchivada(nombre: RutaArchivable): boolean {
  return !revividas().includes(nombre) && ARCHIVADAS_POR_DEFECTO.includes(nombre)
}

// Los hrefs que la navegación debe ocultar. Se resuelve en el servidor y se pasa
// al shell: el flag es de entorno y AppShell es un componente de cliente.
export function hrefsArchivados(): string[] {
  return ARCHIVADAS_POR_DEFECTO.filter((r) => rutaArchivada(r)).map((r) => `/${r}`)
}
