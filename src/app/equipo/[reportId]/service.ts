import { prisma } from '@/lib/prisma'
import { getCoberturaCompetencias } from '@/app/desarrollo/service'

export async function getCoberturaParaManager(managerId: string, reportId: string) {
  const report = await prisma.user.findUnique({ where: { id: reportId } })
  if (!report || report.managerId !== managerId) return null // frontera de privacidad — dueño + su gerente, no pares

  const cobertura = await getCoberturaCompetencias(reportId)
  const gapsTop5 = cobertura.filter((c) => c.evidenciaCount === 0).slice(0, 5)
  return { report: { nombre: report.nombre }, cobertura, gapsTop5 }
}
