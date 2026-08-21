import { describe, it, expect, beforeEach } from 'vitest'
import type { VariableConfianza } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getMapaStakeholders, saludDe, tierDe, CADENCIA_POR_TIER } from '@/app/(app)/stakeholders/service'
import { deleteTestUser } from './helpers/cleanup'

// Health score de relación por stakeholder. Lo que se prueba aquí no es que el
// número exista, sino las tres afirmaciones que lo hacen distinto de la cadencia
// que ya había:
//
// 1. El tier de saliencia (Mitchell/Agle/Wood) lo fijan los TRES atributos, y es
//    el tier —no el gusto— el que decide cada cuánto hay que hablarle.
// 2. Un incumplimiento pesa 3x un contacto positivo. Sin eso el marcador premia
//    volumen de contactos y perdona la promesa rota.
// 3. La cadencia decae: al doble del intervalo esperado la relación es fría,
//    aunque el último contacto haya sido excelente.

const TEST_EMAIL = 'test-stakeholder-salud@vp.mx'
const OTRO_EMAIL = 'test-stakeholder-salud-otro@vp.mx'
const HOY = new Date('2026-08-20T12:00:00Z')

beforeEach(async () => {
  await deleteTestUser(TEST_EMAIL)
  await deleteTestUser(OTRO_EMAIL)
})

async function usuario(email = TEST_EMAIL) {
  return prisma.user.create({ data: { email, nombre: 'Test', passwordHash: 'x' } })
}

async function stakeholder(
  userId: string,
  datos: {
    nombre: string
    poder?: number
    legitimidad?: boolean
    urgencia?: boolean
    cadenciaDias?: number | null
  }
) {
  return prisma.stakeholder.create({
    data: {
      userId,
      nombre: datos.nombre,
      poder: datos.poder ?? 2,
      legitimidad: datos.legitimidad ?? false,
      urgencia: datos.urgencia ?? false,
      cadenciaDias: datos.cadenciaDias ?? null,
    },
  })
}

async function interaccion(
  stakeholderId: string,
  fecha: string,
  extra: { variableConfianza?: VariableConfianza | null; esIncumplimiento?: boolean } = {}
) {
  return prisma.stakeholderInteraccion.create({
    data: {
      stakeholderId,
      fecha: new Date(fecha),
      tipo: 'junta',
      variableConfianza: extra.variableConfianza ?? null,
      esIncumplimiento: extra.esIncumplimiento ?? false,
    },
  })
}

// Días ANTES de HOY, en ISO. Escribir fechas a mano en cada caso hace que mover
// HOY rompa la mitad de la suite por razones que no son el comportamiento.
function haceDias(n: number): string {
  const d = new Date(HOY.getTime() - n * 86_400_000)
  return d.toISOString().slice(0, 10)
}

const SIN_CONTACTOS = { poder: 2, legitimidad: false, urgencia: false, cadenciaDias: null }

describe('tierDe — saliencia por atributos', () => {
  it('los tres atributos son un stakeholder definitivo', () => {
    expect(tierDe(3, true, true)).toBe('definitivo')
  })

  it('dos de tres es expectante, sin importar cuáles', () => {
    expect(tierDe(3, true, false)).toBe('expectante')
    expect(tierDe(3, false, true)).toBe('expectante')
    expect(tierDe(1, true, true)).toBe('expectante')
  })

  it('uno o ninguno es latente', () => {
    expect(tierDe(3, false, false)).toBe('latente')
    expect(tierDe(1, false, false)).toBe('latente')
  })

  it('poder medio NO cuenta como atributo de saliencia', () => {
    // Mismo criterio que la matriz: si un 2 contara como poder, todo el mundo
    // subiría de tier y la clasificación dejaría de discriminar.
    expect(tierDe(2, true, true)).toBe('expectante')
  })

  it('el tier fija la cadencia esperada cuando no hay una comprometida', () => {
    const definitivo = saludDe({ ...SIN_CONTACTOS, poder: 3, legitimidad: true, urgencia: true }, [], HOY)
    const expectante = saludDe({ ...SIN_CONTACTOS, poder: 3, legitimidad: true }, [], HOY)
    const latente = saludDe(SIN_CONTACTOS, [], HOY)

    expect(definitivo.cadenciaEsperada).toBe(CADENCIA_POR_TIER.definitivo)
    expect(expectante.cadenciaEsperada).toBe(CADENCIA_POR_TIER.expectante)
    expect(latente.cadenciaEsperada).toBe(CADENCIA_POR_TIER.latente)
  })

  it('una cadencia comprometida gana sobre el default del tier', () => {
    // Un compromiso explícito con el stakeholder pesa más que el modelo: el modelo
    // rellena lo que no se decidió, no sobrescribe lo que sí.
    const s = saludDe({ poder: 3, legitimidad: true, urgencia: true, cadenciaDias: 21 }, [], HOY)
    expect(s.tier).toBe('definitivo')
    expect(s.cadenciaEsperada).toBe(21)
  })
})

describe('saludDe — asimetría 3:1', () => {
  const AL_DIA = { poder: 2, legitimidad: false, urgencia: false, cadenciaDias: 30 }

  it('tres contactos positivos y un incumplimiento se cancelan: score neutral', () => {
    const s = saludDe(
      AL_DIA,
      [
        { fecha: new Date(haceDias(20)), variableConfianza: 'credibilidad', esIncumplimiento: false },
        { fecha: new Date(haceDias(15)), variableConfianza: 'intimidad', esIncumplimiento: false },
        { fecha: new Date(haceDias(10)), variableConfianza: 'confiabilidad', esIncumplimiento: false },
        { fecha: new Date(haceDias(5)), variableConfianza: null, esIncumplimiento: true },
      ],
      HOY
    )

    expect(s.contactosPositivos).toBe(3)
    expect(s.incumplimientos).toBe(1)
    expect(s.confianzaNeta).toBe(0)
    // Neutral exacto: 3 construidos menos 3 erosionados por uno solo roto.
    expect(s.score).toBe(50)
  })

  it('un incumplimiento contra DOS positivos deja la relación en riesgo, no enfriándose', () => {
    const s = saludDe(
      AL_DIA,
      [
        { fecha: new Date(haceDias(20)), variableConfianza: 'credibilidad', esIncumplimiento: false },
        { fecha: new Date(haceDias(10)), variableConfianza: 'intimidad', esIncumplimiento: false },
        { fecha: new Date(haceDias(3)), variableConfianza: null, esIncumplimiento: true },
      ],
      HOY
    )

    expect(s.confianzaNeta).toBe(-1)
    expect(s.score).toBeLessThan(50)
    // Contacto de hace 3 días sobre cadencia de 30: la cadencia está impecable. La
    // etiqueta tiene que venir del incumplimiento o el marcador no aporta nada.
    expect(s.etiqueta).toBe('en_riesgo')
    expect(s.siguienteAccion).toContain('incumplimiento')
  })

  it('cuatro positivos absorben un incumplimiento y la relación vuelve a sana', () => {
    const s = saludDe(
      AL_DIA,
      [
        { fecha: new Date(haceDias(25)), variableConfianza: 'credibilidad', esIncumplimiento: false },
        { fecha: new Date(haceDias(20)), variableConfianza: 'confiabilidad', esIncumplimiento: false },
        { fecha: new Date(haceDias(15)), variableConfianza: 'intimidad', esIncumplimiento: false },
        { fecha: new Date(haceDias(10)), variableConfianza: 'bajaAutoOrientacion', esIncumplimiento: false },
        { fecha: new Date(haceDias(5)), variableConfianza: null, esIncumplimiento: true },
      ],
      HOY
    )

    expect(s.confianzaNeta).toBe(1)
    expect(s.score).toBeGreaterThan(50)
    expect(s.etiqueta).toBe('sana')
  })

  it('un contacto sin variable de confianza cumple la cadencia pero no construye nada', () => {
    const s = saludDe(
      AL_DIA,
      [{ fecha: new Date(haceDias(2)), variableConfianza: null, esIncumplimiento: false }],
      HOY
    )

    expect(s.contactosPositivos).toBe(0)
    expect(s.confianzaNeta).toBe(0)
    expect(s.score).toBe(50)
    expect(s.etiqueta).toBe('sana')
  })

  it('lo que pasó hace más de 90 días ya no describe la relación de hoy', () => {
    const s = saludDe(
      { ...AL_DIA, cadenciaDias: 120 },
      [
        { fecha: new Date(haceDias(100)), variableConfianza: null, esIncumplimiento: true },
        { fecha: new Date(haceDias(5)), variableConfianza: 'credibilidad', esIncumplimiento: false },
      ],
      HOY
    )

    expect(s.incumplimientos).toBe(0)
    expect(s.confianzaNeta).toBe(1)
    expect(s.etiqueta).toBe('sana')
  })
})

describe('saludDe — decay de cadencia', () => {
  const CADA_10 = { poder: 2, legitimidad: false, urgencia: false, cadenciaDias: 10 }

  it('dentro de la cadencia la relación está sana y no hay castigo', () => {
    const s = saludDe(CADA_10, [{ fecha: new Date(haceDias(8)), variableConfianza: null, esIncumplimiento: false }], HOY)

    expect(s.razonCadencia).toBeLessThanOrEqual(1)
    expect(s.etiqueta).toBe('sana')
    expect(s.score).toBe(50)
  })

  it('pasada la cadencia sin llegar al doble, la relación se está enfriando', () => {
    const s = saludDe(
      CADA_10,
      [{ fecha: new Date(haceDias(15)), variableConfianza: null, esIncumplimiento: false }],
      HOY
    )

    expect(s.diasSinContacto).toBe(15)
    expect(s.razonCadencia).toBe(1.5)
    expect(s.etiqueta).toBe('enfriandose')
    expect(s.score).toBeLessThan(50)
  })

  it('al DOBLE de la cadencia la relación es fría', () => {
    const s = saludDe(
      CADA_10,
      [{ fecha: new Date(haceDias(20)), variableConfianza: null, esIncumplimiento: false }],
      HOY
    )

    expect(s.razonCadencia).toBe(2)
    expect(s.etiqueta).toBe('fria')
    expect(s.score).toBeLessThan(50)
  })

  it('un contacto excelente no compra tiempo indefinido: al doble sigue fría', () => {
    // La confianza acumulada sube el score pero no apaga el decay. Es el punto:
    // "ya habíamos hecho click" no es un sustituto de volver a hablarle.
    const s = saludDe(
      CADA_10,
      [
        { fecha: new Date(haceDias(25)), variableConfianza: 'intimidad', esIncumplimiento: false },
        { fecha: new Date(haceDias(22)), variableConfianza: 'credibilidad', esIncumplimiento: false },
      ],
      HOY
    )

    expect(s.etiqueta).toBe('fria')
    expect(s.confianzaNeta).toBe(2)
  })

  it('nunca contactado es peor que cualquier retraso finito', () => {
    const s = saludDe(CADA_10, [], HOY)

    expect(s.diasSinContacto).toBeNull()
    expect(s.razonCadencia).toBeNull()
    expect(s.etiqueta).toBe('fria')
    expect(s.score).toBe(0)
    expect(s.siguienteAccion).toContain('Nunca')
  })
})

describe('saludDe — variable menos trabajada', () => {
  const AL_DIA = { poder: 2, legitimidad: false, urgencia: false, cadenciaDias: 30 }

  it('sin historial arranca por credibilidad, no por intimidad', () => {
    const s = saludDe(AL_DIA, [], HOY)
    expect(s.variableMenosTrabajada).toBe('credibilidad')
    expect(s.siguienteAccion).toContain('credibilidad')
  })

  it('señala el hueco real cuando ya se trabajaron las otras tres', () => {
    const s = saludDe(
      AL_DIA,
      [
        { fecha: new Date(haceDias(20)), variableConfianza: 'credibilidad', esIncumplimiento: false },
        { fecha: new Date(haceDias(15)), variableConfianza: 'confiabilidad', esIncumplimiento: false },
        { fecha: new Date(haceDias(10)), variableConfianza: 'intimidad', esIncumplimiento: false },
      ],
      HOY
    )

    expect(s.variableMenosTrabajada).toBe('bajaAutoOrientacion')
    expect(s.siguienteAccion).toContain('baja auto-orientación')
  })
})

describe('getMapaStakeholders — salud sobre datos reales', () => {
  it('calcula tier, score y etiqueta por stakeholder', async () => {
    const user = await usuario()
    const definitivo = await stakeholder(user.id, {
      nombre: 'Directora de Logística',
      poder: 3,
      legitimidad: true,
      urgencia: true,
    })
    await interaccion(definitivo.id, haceDias(3), { variableConfianza: 'credibilidad' })

    const mapa = await getMapaStakeholders(user.id, HOY)
    const s = mapa.stakeholders[0]

    expect(s.salud.tier).toBe('definitivo')
    expect(s.salud.atributos).toBe(3)
    expect(s.salud.cadenciaEsperada).toBe(7)
    expect(s.salud.etiqueta).toBe('sana')
    expect(s.salud.score).toBeGreaterThan(50)
  })

  it('un incumplimiento registrado tumba la salud aunque la cadencia esté al día', async () => {
    const user = await usuario()
    const s = await stakeholder(user.id, { nombre: 'Compras', poder: 3, cadenciaDias: 30 })
    await interaccion(s.id, haceDias(10), { variableConfianza: 'credibilidad' })
    await interaccion(s.id, haceDias(2), { esIncumplimiento: true })

    const mapa = await getMapaStakeholders(user.id, HOY)
    const vista = mapa.stakeholders[0]

    // La cadencia sigue verde — el marcador viejo no habría visto nada.
    expect(vista.cadenciaVencida).toBe(false)
    expect(vista.salud.etiqueta).toBe('en_riesgo')
    expect(mapa.resumen.enRiesgo).toBe(1)
  })

  it('cuenta las relaciones frías para el encabezado', async () => {
    const user = await usuario()
    // Latente, cadencia por tier de 30 días, último contacto hace 70: más del doble.
    const olvidado = await stakeholder(user.id, { nombre: 'Olvidado' })
    await interaccion(olvidado.id, haceDias(70), { variableConfianza: 'credibilidad' })
    // Al día — no debe contar.
    const alDia = await stakeholder(user.id, { nombre: 'Al día' })
    await interaccion(alDia.id, haceDias(4), { variableConfianza: 'credibilidad' })

    const mapa = await getMapaStakeholders(user.id, HOY)

    expect(mapa.resumen.frias).toBe(1)
    expect(mapa.stakeholders.find((s) => s.nombre === 'Olvidado')!.salud.etiqueta).toBe('fria')
    expect(mapa.stakeholders.find((s) => s.nombre === 'Al día')!.salud.etiqueta).toBe('sana')
  })

  it('las interacciones de otro usuario no contaminan el marcador', async () => {
    const user = await usuario()
    const otro = await usuario(OTRO_EMAIL)

    // Mismo nombre en ambos usuarios: si el service filtrara mal, el score del
    // propio se llevaría los incumplimientos del ajeno.
    const propio = await stakeholder(user.id, { nombre: 'Contacto compartido', cadenciaDias: 30 })
    await interaccion(propio.id, haceDias(5), { variableConfianza: 'credibilidad' })

    const ajeno = await stakeholder(otro.id, { nombre: 'Contacto compartido', cadenciaDias: 30 })
    await interaccion(ajeno.id, haceDias(4), { esIncumplimiento: true })
    await interaccion(ajeno.id, haceDias(3), { esIncumplimiento: true })

    const mapa = await getMapaStakeholders(user.id, HOY)

    expect(mapa.resumen.total).toBe(1)
    expect(mapa.stakeholders[0].salud.incumplimientos).toBe(0)
    expect(mapa.stakeholders[0].salud.confianzaNeta).toBe(1)
    expect(mapa.stakeholders[0].salud.etiqueta).toBe('sana')
    expect(mapa.resumen.enRiesgo).toBe(0)

    // Y al revés: el otro usuario sí ve lo suyo.
    const mapaAjeno = await getMapaStakeholders(otro.id, HOY)
    expect(mapaAjeno.stakeholders[0].salud.incumplimientos).toBe(2)
    expect(mapaAjeno.stakeholders[0].salud.etiqueta).toBe('en_riesgo')
  })

  it('la ficha sigue mostrando 5 interacciones aunque el score use la ventana completa', async () => {
    const user = await usuario()
    const s = await stakeholder(user.id, { nombre: 'Muy contactado', cadenciaDias: 90 })
    for (const d of [40, 35, 30, 25, 20, 15, 10]) {
      await interaccion(s.id, haceDias(d), { variableConfianza: 'credibilidad' })
    }

    const mapa = await getMapaStakeholders(user.id, HOY)

    expect(mapa.stakeholders[0].interacciones).toHaveLength(5)
    // Las 7 sí pesan en el marcador: el recorte es de presentación, no de cálculo.
    expect(mapa.stakeholders[0].salud.contactosPositivos).toBe(7)
  })
})
