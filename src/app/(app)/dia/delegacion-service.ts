import { prisma } from '@/lib/prisma'

// Ver src/lib/delegacion.ts para la diferencia entre `delegable` (bitácora: la
// hice yo y no debí) y `delegada` (la hace alguien más y sale de mi carga).

export async function delegarTarea(taskId: string, userId: string, delegadoA: string) {
  const nombre = delegadoA.trim()
  // Sin nombre la delegación no es seguimiento de nadie: es solo trabajo que
  // desapareció de la carga. Con Mike y Memo trabajando entregables suyos,
  // perderles el rastro sale más caro que la carga sobrante.
  if (nombre === '') throw new Error('¿A quién se la delegas? Sin nombre no hay a quién darle seguimiento.')

  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task || task.userId !== userId) throw new Error('task no encontrada')

  return prisma.task.update({
    where: { id: taskId },
    // El bloque NO se toca: la tarea sigue en el día, en gris, como compromiso
    // de un tercero. Lo que cambia es que su planMin deja de sumar a la carga,
    // porque el filtro de carga mira el estatus de la tarea.
    data: { estatus: 'delegada', delegadoA: nombre },
  })
}

export async function deshacerDelegacion(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task || task.userId !== userId) throw new Error('task no encontrada')

  // Vuelve a `planned` y no a lo que fuera antes: si regresó a Mau es porque la
  // va a hacer él, y planned es el estado desde el que se agenda y se cronometra.
  return prisma.task.update({
    where: { id: taskId },
    data: { estatus: 'planned', delegadoA: null },
  })
}
