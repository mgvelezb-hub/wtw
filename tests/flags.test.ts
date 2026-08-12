import { describe, it, expect, afterEach } from 'vitest'
import { rutaArchivada, hrefsArchivados } from '@/lib/flags'

// Archivar detrás de un flag, no borrar: el punto es que revivir /roi cueste una
// variable de entorno el día que exista una decisión de precio que dependa de
// ella. Ver docs/plans/2026-08-10-alineacion-council.md §Fase 2.

const ORIGINAL = process.env.WTW_RUTAS_ACTIVAS

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.WTW_RUTAS_ACTIVAS
  else process.env.WTW_RUTAS_ACTIVAS = ORIGINAL
})

describe('rutas archivadas', () => {
  it('/roi está archivada por defecto', () => {
    delete process.env.WTW_RUTAS_ACTIVAS
    expect(rutaArchivada('roi')).toBe(true)
    expect(hrefsArchivados()).toContain('/roi')
  })

  it('WTW_RUTAS_ACTIVAS la revive sin tocar código', () => {
    process.env.WTW_RUTAS_ACTIVAS = 'roi'
    expect(rutaArchivada('roi')).toBe(false)
    expect(hrefsArchivados()).toEqual([])
  })

  it('tolera espacios y otras rutas en la lista', () => {
    process.env.WTW_RUTAS_ACTIVAS = ' otra , roi '
    expect(rutaArchivada('roi')).toBe(false)
  })

  it('una lista vacía no revive nada', () => {
    process.env.WTW_RUTAS_ACTIVAS = ''
    expect(rutaArchivada('roi')).toBe(true)
  })
})
