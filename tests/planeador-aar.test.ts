import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createWeekPayload } from '@/app/api/v1/weeks/service'
import { capacityForWeek } from '@/app/api/v1/capacity/service'
import { getWeekView } from '@/app/(app)/semana/service'
import {
  contextoPlaneacion,
  validarCarga,
  componerReflexion,
  separarReflexion,
  MARCA_CAMBIO,
} from '@/app/(app)/semana/nueva/service'
import { deleteTestUser } from './helpers/cleanup'

// Las tres piezas que vuelven el ritual una compuerta y no un formulario:
// el AAR sobre datos objetivos (paso 1), el plan si-entonces del Win (paso 2), y
// el buffer como restricción y no como cifra decorativa en Settings.

const TEST_EMAIL = 'test-planeador-aar@vp.mx'

// La semana W31 de 2026 corre del 27 al 31 de julio; la W32 arranca el 3 de
// agosto. Planear "hoy 5-ago" hace de la W31 la semana anterior.
const HOY_W32 = new Date('2026-08-05T12:00:00Z')

beforeEach(() => deleteTestUser(TEST_EMAIL))

async function usuario(datos: { bufferPct?: number } = {}) {
  return prisma.user.create({
    data: { email: TEST_EMAIL, nombre: 'Test', passwordHash: 'x', ...datos },
  })
}

describe('paso 1 · AAR sobre datos objetivos', () => {
  it('trae los desvíos de la semana anterior con su causa dominante', async () => {
    const user = await usuario()
    await createWeekPayload(user.id, {
      isoWeek: '2026-W31',
      factorUsado: 1.4,
      wins: [{ posicion: 1, titulo: 'Win' }],
      tasks: [{ ref: 'a', titulo: 'algo', estimadoMin: 120, ajustadoMin: 168 }],
      blocks: [],
    })

    // Dos días reconciliados dentro del rango de la W31: 3h de bomberazo contra
    // 1h sin cronómetro. El dominante es el bomberazo, y le toca al cliente.
    await prisma.dayReconciliation.create({
      data: {
        userId: user.id,
        fecha: new Date('2026-07-28'),
        desvios: { create: [{ causa: 'bomberazo', minutos: 180, orden: 0 }] },
      },
    })
    await prisma.dayReconciliation.create({
      data: {
        userId: user.id,
        fecha: new Date('2026-07-29'),
        desvios: { create: [{ causa: 'trabajo_sin_cronometro', minutos: 60, orden: 0 }] },
      },
    })

    const ctx = await contextoPlaneacion(user.id, HOY_W32)

    expect(ctx.anterior?.desvios.diasReconciliados).toBe(2)
    expect(ctx.anterior?.desvios.totalMin).toBe(240)
    expect(ctx.anterior?.desvios.dominante?.causa).toBe('bomberazo')
    expect(ctx.anterior?.desvios.dominante?.aQuienToca).toBe('cliente')
    // Solo las causas con minutos: tres ceros en pantalla no informan nada.
    expect(ctx.anterior?.desvios.porCausa.map((c) => c.causa)).toEqual(['bomberazo', 'trabajo_sin_cronometro'])
  })

  it('no cuenta los desvíos de OTRA semana como brecha de la anterior', async () => {
    const user = await usuario()
    await createWeekPayload(user.id, { isoWeek: '2026-W31', factorUsado: 1.4, wins: [], tasks: [], blocks: [] })

    // 3 de agosto: ya es la W32, la semana que se está planeando.
    await prisma.dayReconciliation.create({
      data: {
        userId: user.id,
        fecha: new Date('2026-08-03'),
        desvios: { create: [{ causa: 'bomberazo', minutos: 300, orden: 0 }] },
      },
    })

    const ctx = await contextoPlaneacion(user.id, HOY_W32)

    expect(ctx.anterior?.desvios.diasReconciliados).toBe(0)
    expect(ctx.anterior?.desvios.totalMin).toBe(0)
    expect(ctx.anterior?.desvios.dominante).toBeNull()
  })

  it('trae el veredicto del pre-mortem: predichos, ocurridos y defensas que sirvieron', async () => {
    const user = await usuario()
    const week = await createWeekPayload(user.id, {
      isoWeek: '2026-W31',
      factorUsado: 1.4,
      wins: [],
      tasks: [],
      riesgos: [
        { riesgo: 'el cliente manda la data tarde', defensa: 'pedirla el lunes' },
        { riesgo: 'la junta se alarga', defensa: 'agenda con corte duro' },
        { riesgo: 'se cae la VM', defensa: 'respaldo local' },
      ],
      blocks: [],
    })

    const riesgos = await prisma.weekRisk.findMany({ where: { weekId: week.id }, orderBy: { orden: 'asc' } })
    // Uno ocurrió y la defensa sirvió; otro ocurrió y no sirvió; el tercero se
    // queda sin evaluar — y ese NO cuenta como "no ocurrió".
    await prisma.weekRisk.update({ where: { id: riesgos[0].id }, data: { ocurrio: true, defensaFunciono: true } })
    await prisma.weekRisk.update({ where: { id: riesgos[1].id }, data: { ocurrio: true, defensaFunciono: false } })

    const ctx = await contextoPlaneacion(user.id, HOY_W32)

    expect(ctx.anterior?.premortem).toEqual({
      predichos: 3,
      cerrados: 2,
      ocurrieron: 2,
      defensasSirvieron: 1,
    })
  })

  it('sin reconciliación ni pre-mortem el AAR no inventa causas', async () => {
    const user = await usuario()
    await createWeekPayload(user.id, { isoWeek: '2026-W31', factorUsado: 1.4, wins: [], tasks: [], blocks: [] })

    const ctx = await contextoPlaneacion(user.id, HOY_W32)

    expect(ctx.anterior?.desvios.dominante).toBeNull()
    expect(ctx.anterior?.desvios.porCausa).toEqual([])
    expect(ctx.anterior?.premortem.predichos).toBe(0)
  })

  it('la cuarta pregunta del AAR se guarda pegada al recap y se puede volver a separar', () => {
    const texto = componerReflexion('La semana se fue en juntas.', 'No agendo juntas antes de las 11')

    expect(texto).toContain('La semana se fue en juntas.')
    expect(texto).toContain(`${MARCA_CAMBIO} No agendo juntas antes de las 11`)
    expect(separarReflexion(texto)).toEqual({
      recap: 'La semana se fue en juntas.',
      queCambias: 'No agendo juntas antes de las 11',
    })
  })

  it('sin recap ni cambio no escribe una reflexión vacía', () => {
    expect(componerReflexion('', '')).toBeUndefined()
    expect(componerReflexion('', 'Solo el cambio')).toBe(`${MARCA_CAMBIO} Solo el cambio`)
    expect(separarReflexion(null)).toEqual({ recap: '', queCambias: '' })
  })
})

describe('paso 2 · el si-entonces del Win', () => {
  it('persiste con el Win y sale en la vista de la semana', async () => {
    const user = await usuario()
    await createWeekPayload(user.id, {
      isoWeek: '2026-W32',
      factorUsado: 1.4,
      wins: [
        {
          posicion: 1,
          titulo: 'Modelo de costeo entregado',
          dod: 'el cliente lo tiene en su bandeja',
          siEntonces: 'Si el cliente no manda la data el martes, entonces corro el modelo con el supuesto anterior y lo marco',
        },
        { posicion: 2, titulo: 'Win sin plan' },
      ],
      tasks: [],
      blocks: [],
    })

    const view = await getWeekView(user.id, '2026-W32')
    const wins = view!.week.wins

    // El repaso durante la semana es lo que hace que el si-entonces sirva: si se
    // escribe en el planeador y nunca se vuelve a ver, es solo texto guardado.
    expect(wins[0].siEntonces).toBe(
      'Si el cliente no manda la data el martes, entonces corro el modelo con el supuesto anterior y lo marco'
    )
    // El campo es opcional: la skill y POST /weeks siguen creando Wins sin él.
    expect(wins[1].siEntonces).toBeNull()
  })
})

describe('paso 5 · el buffer es una restricción, no una cifra en Settings', () => {
  it('rechaza un plan que excede planeable − buffer', async () => {
    const user = await usuario({ bufferPct: 25 })
    const capacidad = await capacityForWeek(user.id, '2026-W32')

    // Jornada default 09:00-18:00 menos una hora de comida: 8h por día hábil.
    expect(capacidad.trabajableTotal).toBe(40)
    expect(capacidad.trabajablePlaneable).toBe(30)

    // 32h de carga caben en las 40h trabajables pero NO en las 30h planeables:
    // exactamente el plan que antes se dejaba crear al 100%.
    const excedido = validarCarga(32 * 60, capacidad)
    expect(excedido.ok).toBe(false)
    expect(excedido.excedenteMin).toBe(2 * 60)
    expect(excedido.mensaje).toContain('recorta 2h')

    // Justo en el límite sí cabe: la regla es "no exceder", no "dejar margen
    // sobre el margen".
    const justo = validarCarga(30 * 60, capacidad)
    expect(justo.ok).toBe(true)
    expect(justo.mensaje).toBeNull()
  })

  it('sin tiempo planeable manda a Settings en vez de pedir un recorte imposible', () => {
    const sinHuecos = { dias: [], trabajableTotal: 0, trabajablePlaneable: 0 }
    const r = validarCarga(3 * 60, sinHuecos)

    expect(r.ok).toBe(false)
    expect(r.mensaje).toContain('no tiene tiempo planeable')
    expect(r.mensaje).not.toContain('recorta')
  })

  it('un buffer más grande recorta antes', async () => {
    const user = await usuario({ bufferPct: 50 })
    const capacidad = await capacityForWeek(user.id, '2026-W32')

    expect(capacidad.trabajablePlaneable).toBe(20)
    expect(validarCarga(25 * 60, capacidad).excedenteMin).toBe(5 * 60)
  })
})
