import { prisma } from '@/lib/prisma'

export async function getCoberturaCompetencias(userId: string) {
  const competencias = await prisma.competency.findMany({
    include: { evidences: { where: { userId } } },
    orderBy: [{ tipo: 'asc' }, { grupo: 'asc' }, { orden: 'asc' }],
  })
  return competencias.map((c) => ({
    id: c.id,
    tipo: c.tipo,
    grupo: c.grupo,
    texto: c.texto,
    evidenciaCount: c.evidences.length,
  }))
}
