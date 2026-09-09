import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { getProyectoDetalle, semaforoDe } from '@/app/(app)/proyectos/[id]/service'

const TEST_EMAIL = 'test-proydet@vp.mx'
beforeEach(() => deleteTestUser(TEST_EMAIL))

describe('getProyectoDetalle', () => {
  it('marca semáforo "atrasado" si fechaProyectada > fechaComprometida', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const proj = await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool' } })
    await prisma.deliverable.create({
      data: { projectId: proj.id, nombre: 'KPIs', fechaComprometida: new Date('2026-07-01'), fechaProyectada: new Date('2026-07-10'), avancePct: 40 },
    })
    const detalle = await getProyectoDetalle(user.id, proj.id)
    expect(detalle!.entregables[0].semaforo).toBe('atrasado')
  })

  // Este test afirmaba lo contrario: que sin `fechaProyectada` el semáforo era
  // "a_tiempo" aunque el compromiso ya hubiera vencido. Era el bug, escrito como
  // expectativa — la única forma de ponerlo en rojo era declararlo tarde a mano.
  it('un compromiso vencido sale atrasado aunque nadie haya puesto forecast', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const proj = await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool' } })
    await prisma.deliverable.create({ data: { projectId: proj.id, nombre: 'KPIs', fechaComprometida: new Date('2026-07-10'), avancePct: 10 } })
    const detalle = await getProyectoDetalle(user.id, proj.id)
    expect(detalle!.entregables[0].semaforo).toBe('atrasado')
  })

  it('devuelve null si el proyecto no es del usuario', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const proj = await prisma.project.create({ data: { userId: user.id, nombre: 'X' } })
    expect(await getProyectoDetalle('otro-id', proj.id)).toBeNull()
  })
})

describe('semáforo de entregables', () => {
  // Antes solo comparaba proyectada contra comprometida: un entregable
  // comprometido para ayer y sin forecast salía verde "A tiempo". La pantalla
  // confirmaba el sobre-optimismo en vez de contradecirlo.
  // Medianoche UTC del día calendario, que es como Prisma devuelve un `@db.Date`.
  const HOY = new Date('2026-09-08T00:00:00Z')
  const AYER = new Date('2026-09-07')
  const MANANA = new Date('2026-09-09')

  it('un compromiso vencido está atrasado aunque no haya forecast', () => {
    expect(semaforoDe({ estatus: 'rev_interna', fechaComprometida: AYER, fechaProyectada: null }, HOY)).toBe('atrasado')
  })

  it('un forecast que rebasa el compromiso está atrasado aunque falten semanas', () => {
    expect(
      semaforoDe({ estatus: 'borrador', fechaComprometida: MANANA, fechaProyectada: new Date('2026-10-01') }, HOY)
    ).toBe('atrasado')
  })

  it('sin fecha comprometida no hay contra qué medir — no dice "A tiempo"', () => {
    expect(semaforoDe({ estatus: 'borrador', fechaComprometida: null, fechaProyectada: null }, HOY)).toBe('sin_fecha')
  })

  it('lo aceptado ya no corre contra reloj', () => {
    expect(semaforoDe({ estatus: 'aceptado', fechaComprometida: AYER, fechaProyectada: null }, HOY)).toBe('aceptado')
  })

  it('comprometido para hoy todavía no está atrasado', () => {
    expect(
      semaforoDe({ estatus: 'rev_cliente', fechaComprometida: new Date('2026-09-08'), fechaProyectada: null }, HOY)
    ).toBe('a_tiempo')
  })
})
