import { prisma } from './prisma'
import type { TipoTrabajo } from '@prisma/client'
import { TIPOS_TRABAJO } from './tipo-trabajo'

// Factor de realismo POR CLASE DE REFERENCIA.
//
// El factor global (`factor-realismo.ts`, hoy `user.factorManual ?? 1.4`) promedia
// clases que no se parecen: armar un deck y preparar una junta fallan distinto y en
// distinta magnitud. La evidencia de la falacia de planeación dice que la corrección
// solo calibra si se mide por tipo de trabajo Y se re-inyecta en la estimación
// siguiente — un número que solo se contempla en Settings no cambia ninguna
// estimación.
//
// Se mide con SUMAS, no con promedio de razones: sum(medido)/sum(planeado). Un
// promedio de ratios le da el mismo peso a una tarea de 15 min que a una de 6 h, y
// una tarea chica mal estimada (10 min planeados, 40 reales → ×4) domina el número.
// La suma pondera por tamaño, que es como se consume la semana.
//
// Se usa `estimadoMin` y no `ajustadoMin` a propósito: `ajustadoMin` ya trae el
// factor aplicado. Medir contra él sería medir el factor contra sí mismo y el
// número convergería a 1.0 aunque la estimación cruda siguiera siendo optimista.

// Debajo de 3 tareas terminadas el cociente es ruido: una sola junta que se alargó
// mueve el factor entero. Sin datos suficientes se devuelve null y la UI no sugiere
// nada — no se inventa una corrección para poder mostrar un número.
const MIN_MUESTRAS = 3

export type FactorClase = {
  factor: number | null
  muestras: number
}

export async function factorPorClase(userId: string): Promise<Record<TipoTrabajo, FactorClase>> {
  const tasks = await prisma.task.findMany({
    where: {
      userId,
      estatus: 'done',
      tipoTrabajo: { not: null },
      estimadoMin: { not: null },
    },
    select: {
      tipoTrabajo: true,
      estimadoMin: true,
      timeEntries: { select: { seconds: true } },
    },
  })

  const acumulado = new Map<TipoTrabajo, { planeado: number; medido: number; muestras: number }>()
  for (const t of tasks) {
    if (!t.tipoTrabajo || !t.estimadoMin) continue
    const medidoMin = t.timeEntries.reduce((s, e) => s + e.seconds, 0) / 60
    // Sin tiempo medido no hay medición que comparar — la tarea se cerró sin
    // cronómetro. Contarla como muestra metería un cero al numerador y sesgaría el
    // factor hacia abajo, que es exactamente el error que este cálculo corrige.
    if (medidoMin <= 0) continue

    const acc = acumulado.get(t.tipoTrabajo) ?? { planeado: 0, medido: 0, muestras: 0 }
    acc.planeado += t.estimadoMin
    acc.medido += medidoMin
    acc.muestras += 1
    acumulado.set(t.tipoTrabajo, acc)
  }

  const resultado = {} as Record<TipoTrabajo, FactorClase>
  for (const tipo of TIPOS_TRABAJO) {
    const acc = acumulado.get(tipo)
    const suficiente = acc !== undefined && acc.muestras >= MIN_MUESTRAS && acc.planeado > 0
    resultado[tipo] = {
      factor: suficiente ? Math.round((acc.medido / acc.planeado) * 10) / 10 : null,
      muestras: acc?.muestras ?? 0,
    }
  }
  return resultado
}
