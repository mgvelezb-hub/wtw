import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { getLienzoSemana } from '@/app/(app)/semana/service'
import { posicionarBloque, horaDesdeOffset, PX_POR_HORA } from '@/app/(app)/semana/lienzo'

const TEST_EMAIL = 'test-lienzo@vp.mx'
const OTRO_EMAIL = 'test-lienzo-otro@vp.mx'
const ISO_WEEK = '2026-W28'
const LUNES = '2026-07-06'
const MARTES = '2026-07-07'

beforeEach(async () => {
  await deleteTestUser(TEST_EMAIL)
  await deleteTestUser(OTRO_EMAIL)
})

async function usuario(email: string) {
  return prisma.user.create({
    data: {
      email,
      nombre: 'T',
      passwordHash: 'x',
      horarioInicio: '09:00',
      horarioFin: '18:00',
      comidaInicio: '14:00',
      comidaFin: '15:00',
      bufferPct: 25,
    },
  })
}

async function semana(userId: string) {
  return prisma.week.create({
    data: {
      userId,
      isoWeek: ISO_WEEK,
      rangoInicio: new Date(LUNES),
      rangoFin: new Date('2026-07-10'),
      factorUsado: 1.4,
    },
  })
}

async function bloque(
  weekId: string,
  fecha: string,
  inicio: string,
  fin: string,
  planMin: number,
  titulo = 'Bloque'
) {
  return prisma.block.create({
    data: { weekId, fecha: new Date(fecha), inicio, fin, tipo: 'tarea', titulo, planMin },
  })
}

describe('posicionarBloque · la geometría es aritmética, no DOM', () => {
  it('un bloque dentro de la jornada se posiciona en minutos desde el inicio de jornada', () => {
    // Jornada 09:00–18:00 → 540–1080. Un bloque 10:00–11:30 empieza 60 min
    // después de que abre la jornada y dura 90.
    expect(posicionarBloque('10:00', '11:30', 90, 540, 1080)).toEqual({
      ubicacion: 'grid',
      topMin: 60,
      durMin: 90,
    })
    // El primer bloque del día se pega al borde superior del grid.
    expect(posicionarBloque('09:00', '10:00', 60, 540, 1080).topMin).toBe(0)
  })

  it('un bloque sin hora es flex y no tiene posición', () => {
    expect(posicionarBloque('flex', 'flex', 45, 540, 1080)).toEqual({
      ubicacion: 'flex',
      topMin: null,
      durMin: 45,
    })
  })

  it('soltar a una altura redondea la hora a 15 min y no se sale de la jornada', () => {
    // 64 px = 1 h. A 100 px del tope: 09:00 + 93.75 min → 10:30 con snap de 15.
    expect(horaDesdeOffset(100, 540, 1080)).toBe('10:30')
    expect(horaDesdeOffset(PX_POR_HORA * 2, 540, 1080)).toBe('11:00')
    // Arriba del grid y debajo del grid quedan acotados a la jornada.
    expect(horaDesdeOffset(-500, 540, 1080)).toBe('09:00')
    expect(horaDesdeOffset(99999, 540, 1080)).toBe('17:45')
  })
})

describe('getLienzoSemana', () => {
  it('(a) posiciona el bloque con hora dentro del grid', async () => {
    const user = await usuario(TEST_EMAIL)
    const week = await semana(user.id)
    const b = await bloque(week.id, MARTES, '10:00', '11:30', 90, 'KPIs de costo')

    const v = await getLienzoSemana(user.id, ISO_WEEK, LUNES)
    const pintado = v!.bloques.find((x) => x.id === b.id)!

    expect(pintado.ubicacion).toBe('grid')
    expect(pintado.topMin).toBe(60) // 10:00 − 09:00
    expect(pintado.durMin).toBe(90)
    expect(pintado.fecha).toBe(MARTES)
    expect(v!.jornadaInicioMin).toBe(540)
    expect(v!.horas).toEqual(['09', '10', '11', '12', '13', '14', '15', '16', '17'])
  })

  it('(b) un bloque fuera de jornada no se dibuja en el grid: se lista aparte', async () => {
    const user = await usuario(TEST_EMAIL)
    const week = await semana(user.id)
    const tarde = await bloque(week.id, LUNES, '20:30', '21:30', 60, 'Entregable de paquetes')
    const temprano = await bloque(week.id, LUNES, '07:00', '08:00', 60, 'Correo antes de abrir')
    const dentro = await bloque(week.id, LUNES, '09:00', '10:00', 60, 'Dentro')

    const v = await getLienzoSemana(user.id, ISO_WEEK, LUNES)

    expect(v!.bloques.find((x) => x.id === tarde.id)!.ubicacion).toBe('fuera')
    expect(v!.bloques.find((x) => x.id === temprano.id)!.ubicacion).toBe('fuera')
    expect(v!.bloques.find((x) => x.id === dentro.id)!.ubicacion).toBe('grid')

    // La franja de abajo los lista con día, rango y título — es la salida que
    // hace visible el costo de haberse salido de la jornada.
    expect(v!.fueraDeJornada.map((f) => f.titulo)).toEqual(['Correo antes de abrir', 'Entregable de paquetes'])
    expect(v!.fueraDeJornada[1]).toMatchObject({ abr: 'Lun', rango: '20:30 – 21:30' })
  })

  it('(c) el meter diario es planeado/jornada del día', async () => {
    const user = await usuario(TEST_EMAIL)
    const week = await semana(user.id)
    // Jornada = 09:00–18:00 (540 min) − 1h de comida = 480 min planeables.
    await bloque(week.id, MARTES, '09:00', '11:00', 120)
    await bloque(week.id, MARTES, '11:00', '13:00', 120)

    const v = await getLienzoSemana(user.id, ISO_WEEK, LUNES)
    const martes = v!.dias.find((d) => d.fecha === MARTES)!

    expect(martes.jornadaMin).toBe(480)
    expect(martes.planeadoMin).toBe(240)
    expect(martes.pct).toBeCloseTo(50, 5)
    // El lunes vacío no inventa carga.
    expect(v!.dias.find((d) => d.fecha === LUNES)!.pct).toBe(0)
  })

  it('(c bis) un día que ya no cabe en sí mismo pasa de 100%', async () => {
    const user = await usuario(TEST_EMAIL)
    const week = await semana(user.id)
    await bloque(week.id, MARTES, '09:00', '17:00', 480)
    await bloque(week.id, MARTES, 'flex', 'flex', 120)

    const v = await getLienzoSemana(user.id, ISO_WEEK, LUNES)
    expect(v!.dias.find((d) => d.fecha === MARTES)!.pct).toBeCloseTo(125, 5)
  })

  it('(d) los bloques y pendientes de otro usuario no contaminan el lienzo', async () => {
    const user = await usuario(TEST_EMAIL)
    const otro = await usuario(OTRO_EMAIL)
    const week = await semana(user.id)
    const weekOtro = await semana(otro.id)

    const mio = await bloque(week.id, MARTES, '10:00', '11:00', 60, 'Mío')
    const ajeno = await bloque(weekOtro.id, MARTES, '12:00', '13:00', 60, 'Ajeno')
    await prisma.task.create({ data: { userId: otro.id, titulo: 'Pendiente ajeno', estatus: 'backlog' } })
    await prisma.task.create({ data: { userId: user.id, titulo: 'Pendiente mío', estatus: 'backlog' } })

    const v = await getLienzoSemana(user.id, ISO_WEEK, LUNES)

    expect(v!.bloques.map((b) => b.id)).toContain(mio.id)
    expect(v!.bloques.map((b) => b.id)).not.toContain(ajeno.id)
    expect(v!.bandeja.map((t) => t.titulo)).toEqual(['Pendiente mío'])
    // Y la carga del martes solo cuenta lo propio.
    expect(v!.dias.find((d) => d.fecha === MARTES)!.planeadoMin).toBe(60)
  })

  it('las juntas de Outlook entran como bloques externos y suman al día', async () => {
    const user = await usuario(TEST_EMAIL)
    await semana(user.id)
    await prisma.calendarEvent.create({
      data: {
        userId: user.id,
        externalId: 'evt-1',
        fecha: new Date(MARTES),
        inicio: '12:00',
        fin: '13:00',
        titulo: 'Comité de negociaciones',
      },
    })

    const v = await getLienzoSemana(user.id, ISO_WEEK, LUNES)
    const junta = v!.bloques.find((b) => b.externa)!

    expect(junta.titulo).toBe('Comité de negociaciones')
    expect(junta.ubicacion).toBe('grid')
    expect(junta.topMin).toBe(180) // 12:00 − 09:00
    expect(v!.dias.find((d) => d.fecha === MARTES)!.planeadoMin).toBe(60)
  })
})

// El lienzo era ciego al fin de semana: `weekRange` da lun–vie, así que los
// bloques de sábado y domingo ni se cargaban — justo donde vive la evidencia
// más fuerte de erosión de frontera, y la razón por la que el lienzo listaba 6
// bloques fuera de jornada mientras la señal JD-R decía 61%.
describe('getLienzoSemana · fin de semana', () => {
  const SABADO = '2026-07-11'
  const DOMINGO = '2026-07-12'

  it('sin trabajo registrado, la semana sigue siendo de lunes a viernes', async () => {
    const user = await usuario(TEST_EMAIL)
    const week = await semana(user.id)
    await bloque(week.id, MARTES, '10:00', '11:00', 60)

    const v = await getLienzoSemana(user.id, ISO_WEEK, LUNES)

    expect(v!.dias.map((d) => d.abr)).toEqual(['Lun', 'Mar', 'Mié', 'Jue', 'Vie'])
  })

  it('un bloque en sábado abre la columna del sábado, y solo esa', async () => {
    const user = await usuario(TEST_EMAIL)
    const week = await semana(user.id)
    const sab = await bloque(week.id, SABADO, '11:00', '13:00', 120, 'Deck del comité')

    const v = await getLienzoSemana(user.id, ISO_WEEK, LUNES)

    expect(v!.dias.map((d) => d.abr)).toEqual(['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'])
    const columna = v!.dias.find((d) => d.abr === 'Sáb')!
    expect(columna.fecha).toBe(SABADO)
    expect(columna.finDeSemana).toBe(true)
    expect(v!.bloques.map((b) => b.id)).toContain(sab.id)
  })

  it('una junta de Outlook en domingo también abre la columna', async () => {
    const user = await usuario(TEST_EMAIL)
    await semana(user.id)
    await prisma.calendarEvent.create({
      data: {
        userId: user.id,
        externalId: 'evt-dom',
        fecha: new Date(DOMINGO),
        inicio: '17:00',
        fin: '18:00',
        titulo: 'Llamada con el cliente',
      },
    })

    const v = await getLienzoSemana(user.id, ISO_WEEK, LUNES)
    expect(v!.dias.map((d) => d.abr)).toEqual(['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Dom'])
  })

  // Congruencia con `carga-sostenible.fueraDeJornada`, que cuenta TODO minuto
  // de fin de semana como fuera de jornada sin importar la hora. Si el lienzo
  // pintara el sábado 11:00 dentro del grid, diría que ese trabajo fue normal.
  it('en fin de semana no hay jornada: todo bloque con hora queda fuera', async () => {
    const user = await usuario(TEST_EMAIL)
    const week = await semana(user.id)
    await bloque(week.id, SABADO, '11:00', '13:00', 120, 'Deck del comité')
    await bloque(week.id, DOMINGO, 'flex', 'flex', 45, 'Correo del domingo')

    const v = await getLienzoSemana(user.id, ISO_WEEK, LUNES)

    const sab = v!.bloques.find((b) => b.titulo === 'Deck del comité')!
    expect(sab.ubicacion).toBe('fuera')
    expect(v!.fueraDeJornada.map((f) => f.abr)).toContain('Sáb')

    // Flex se mantiene flex: un bloque sin hora en domingo no finge una hora
    // que nadie comprometió, va al chip bajo su columna.
    expect(v!.bloques.find((b) => b.titulo === 'Correo del domingo')!.ubicacion).toBe('flex')

    const columnaSab = v!.dias.find((d) => d.abr === 'Sáb')!
    expect(columnaSab.jornadaMin).toBe(0)
    expect(columnaSab.planeadoMin).toBe(120)
    expect(columnaSab.pct).toBe(100) // sin jornada, un solo minuto ya llena el meter
  })

  it('un DayOverride con horario declara jornada real en fin de semana', async () => {
    const user = await usuario(TEST_EMAIL)
    const week = await semana(user.id)
    await prisma.dayOverride.create({
      data: { userId: user.id, fecha: new Date(SABADO), inicio: '10:00', fin: '14:00' },
    })
    await bloque(week.id, SABADO, '11:00', '12:00', 60, 'Guardia planeada')

    const v = await getLienzoSemana(user.id, ISO_WEEK, LUNES)
    const columna = v!.dias.find((d) => d.abr === 'Sáb')!

    // 10:00–14:00 menos la hora de comida configurada = 180 min.
    expect(columna.jornadaMin).toBe(180)
    expect(columna.pct).toBeCloseTo(33.33, 1)

    // Un sábado con horario DECLARADO no es erosión de frontera: Mau dijo que
    // ese día trabaja, así que el bloque se pinta en el grid como cualquier
    // otro y no se lista como fuera de jornada.
    const b = v!.bloques.find((x) => x.titulo === 'Guardia planeada')!
    expect(b.ubicacion).toBe('grid')
    expect(v!.fueraDeJornada.map((f) => f.titulo)).not.toContain('Guardia planeada')
  })
})
