import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getMapaStakeholders, cuadranteDe } from '@/app/(app)/stakeholders/service'
import { deleteTestUser } from './helpers/cleanup'

// Mapa de stakeholders con cadencia (Fase 2b, pieza 4). Lo que se prueba aquí es
// la diferencia entre "nunca contactado" y "contactado hace poco": es la señal
// que hace que el mapa sirva para algo más que decorar.

const TEST_EMAIL = 'test-stakeholders@vp.mx'
const HOY = new Date('2026-08-12T12:00:00Z')

beforeEach(() => deleteTestUser(TEST_EMAIL))

async function usuario() {
  return prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'Test', passwordHash: 'x' } })
}

async function stakeholder(
  userId: string,
  datos: { nombre: string; poder?: number; interes?: number; cadenciaDias?: number | null }
) {
  return prisma.stakeholder.create({
    data: {
      userId,
      nombre: datos.nombre,
      poder: datos.poder ?? 2,
      interes: datos.interes ?? 2,
      cadenciaDias: datos.cadenciaDias ?? null,
    },
  })
}

describe('cuadranteDe', () => {
  it('poder alto e interés alto es gestión cercana', () => {
    expect(cuadranteDe(3, 3)).toBe('gestionar_de_cerca')
  })

  it('poder alto con interés bajo es el que hunde el proyecto sin avisar', () => {
    expect(cuadranteDe(3, 1)).toBe('mantener_satisfecho')
  })

  it('poder bajo con interés alto es aliado natural', () => {
    expect(cuadranteDe(1, 3)).toBe('mantener_informado')
  })

  it('el valor por defecto (2,2) NO cae en gestión cercana', () => {
    // Si "medio" contara como alto, todo el mundo caería en el cuadrante caro y
    // la matriz dejaría de discriminar, que es lo único que se le pide.
    expect(cuadranteDe(2, 2)).toBe('monitorear')
  })
})

describe('getMapaStakeholders', () => {
  it('sin stakeholders devuelve el mapa vacío y no truena', async () => {
    const user = await usuario()
    const mapa = await getMapaStakeholders(user.id, HOY)

    expect(mapa.resumen.total).toBe(0)
    expect(mapa.porCuadrante).toHaveLength(4)
    expect(mapa.porCuadrante.every((c) => c.stakeholders.length === 0)).toBe(true)
  })

  it('nunca contactado con cadencia comprometida cuenta como vencido', async () => {
    const user = await usuario()
    await stakeholder(user.id, { nombre: 'Directora de Logística', poder: 3, cadenciaDias: 14 })

    const mapa = await getMapaStakeholders(user.id, HOY)
    const s = mapa.stakeholders[0]

    expect(s.diasSinContacto).toBeNull()
    expect(s.cadenciaVencida).toBe(true)
    // Sin fecha de inicio, el retraso más conservador que se puede afirmar es la
    // cadencia completa.
    expect(s.diasDeRetraso).toBe(14)
    expect(mapa.resumen.nuncaContactados).toBe(1)
    expect(mapa.resumen.poderAltoVencidos).toBe(1)
  })

  it('sin cadencia comprometida NO se marca vencido — no hay promesa que romper', async () => {
    const user = await usuario()
    await stakeholder(user.id, { nombre: 'Contacto suelto', cadenciaDias: null })

    const mapa = await getMapaStakeholders(user.id, HOY)

    expect(mapa.stakeholders[0].cadenciaVencida).toBe(false)
    expect(mapa.resumen.vencidos).toBe(0)
    expect(mapa.resumen.sinCadencia).toBe(1)
  })

  it('un contacto dentro de la cadencia apaga la alerta', async () => {
    const user = await usuario()
    const s = await stakeholder(user.id, { nombre: 'Al día', cadenciaDias: 14 })
    await prisma.stakeholderInteraccion.create({
      data: { stakeholderId: s.id, fecha: new Date('2026-08-08'), tipo: 'junta', nota: 'avance del SOW' },
    })

    const mapa = await getMapaStakeholders(user.id, HOY)

    expect(mapa.stakeholders[0].diasSinContacto).toBe(4)
    expect(mapa.stakeholders[0].cadenciaVencida).toBe(false)
    expect(mapa.stakeholders[0].ultimoContacto).toBe('2026-08-08')
  })

  it('un contacto viejo vence la cadencia y reporta el retraso exacto', async () => {
    const user = await usuario()
    const s = await stakeholder(user.id, { nombre: 'Olvidado', cadenciaDias: 7 })
    await prisma.stakeholderInteraccion.create({
      data: { stakeholderId: s.id, fecha: new Date('2026-07-13'), tipo: 'correo' },
    })

    const mapa = await getMapaStakeholders(user.id, HOY)

    expect(mapa.stakeholders[0].diasSinContacto).toBe(30)
    expect(mapa.stakeholders[0].cadenciaVencida).toBe(true)
    expect(mapa.stakeholders[0].diasDeRetraso).toBe(23)
  })

  it('ordena por retraso contra la propia cadencia, no por antigüedad absoluta', async () => {
    const user = await usuario()
    // 20 días sin contacto sobre una cadencia de 7 = 13 de retraso.
    const apretado = await stakeholder(user.id, { nombre: 'Cadencia apretada', cadenciaDias: 7 })
    await prisma.stakeholderInteraccion.create({
      data: { stakeholderId: apretado.id, fecha: new Date('2026-07-23'), tipo: 'llamada' },
    })
    // 32 días sin contacto sobre una cadencia de 30 = 2 de retraso, aunque el
    // contacto sea MÁS viejo en términos absolutos.
    const holgado = await stakeholder(user.id, { nombre: 'Cadencia holgada', cadenciaDias: 30 })
    await prisma.stakeholderInteraccion.create({
      data: { stakeholderId: holgado.id, fecha: new Date('2026-07-11'), tipo: 'llamada' },
    })

    const mapa = await getMapaStakeholders(user.id, HOY)

    expect(mapa.stakeholders[0].nombre).toBe('Cadencia apretada')
    expect(mapa.stakeholders[1].nombre).toBe('Cadencia holgada')
  })

  it('agrupa en los cuatro cuadrantes de la matriz', async () => {
    const user = await usuario()
    await stakeholder(user.id, { nombre: 'Patrocinador', poder: 3, interes: 3 })
    await stakeholder(user.id, { nombre: 'Finanzas', poder: 3, interes: 1 })
    await stakeholder(user.id, { nombre: 'Analista aliado', poder: 1, interes: 3 })

    const mapa = await getMapaStakeholders(user.id, HOY)
    const por = (c: string) => mapa.porCuadrante.find((x) => x.cuadrante === c)!.stakeholders.map((s) => s.nombre)

    expect(por('gestionar_de_cerca')).toEqual(['Patrocinador'])
    expect(por('mantener_satisfecho')).toEqual(['Finanzas'])
    expect(por('mantener_informado')).toEqual(['Analista aliado'])
    expect(por('monitorear')).toEqual([])
  })

  it('no ve los stakeholders de otro usuario', async () => {
    const user = await usuario()
    const otro = await prisma.user.create({
      data: { email: 'test-stakeholders-otro@vp.mx', nombre: 'Otro', passwordHash: 'x' },
    })
    await stakeholder(otro.id, { nombre: 'Ajeno' })

    const mapa = await getMapaStakeholders(user.id, HOY)
    expect(mapa.resumen.total).toBe(0)

    await prisma.stakeholder.deleteMany({ where: { userId: otro.id } })
    await prisma.user.delete({ where: { id: otro.id } })
  })

  it('trae solo las últimas 5 interacciones, la más reciente primero', async () => {
    const user = await usuario()
    const s = await stakeholder(user.id, { nombre: 'Muy contactado' })
    for (const dia of ['01', '02', '03', '04', '05', '06', '07']) {
      await prisma.stakeholderInteraccion.create({
        data: { stakeholderId: s.id, fecha: new Date(`2026-08-${dia}`), tipo: 'correo', nota: `nota ${dia}` },
      })
    }

    const mapa = await getMapaStakeholders(user.id, HOY)

    expect(mapa.stakeholders[0].interacciones).toHaveLength(5)
    expect(mapa.stakeholders[0].interacciones[0].fecha).toBe('2026-08-07')
    expect(mapa.stakeholders[0].ultimoContacto).toBe('2026-08-07')
  })
})
