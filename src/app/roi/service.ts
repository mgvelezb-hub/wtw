import { prisma } from '@/lib/prisma'

export async function getROIRelacion(userId: string) {
  const proyectos = await prisma.project.findMany({ where: { userId, origen: { not: null } } })

  const porOrigen = new Map<string, string[]>()
  for (const p of proyectos) {
    const key = p.origen!
    const arr = porOrigen.get(key) ?? []
    arr.push(p.nombre)
    porOrigen.set(key, arr)
  }

  return Array.from(porOrigen.entries()).map(([origen, nombres]) => ({
    origen,
    recompras: nombres.length,
    proyectos: nombres,
  }))
}
