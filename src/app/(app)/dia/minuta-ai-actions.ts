'use server'

import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { callModel } from '@/lib/ai/client'
import { GENERATE } from '@/lib/ai/models'
import { extraerJSON } from '@/app/(app)/semana/nueva/parse-json'
import type { MinutaItemTipo } from '@prisma/client'

// Clasificación de minutas con IA. Toma el texto crudo tal como Mau lo captura
// —bloques largos con encabezados libres tipo "Dimensión:", "Costos:",
// "Acuerdos:"— y lo parte en items tipados, listos para promover a Task/Issue.
//
// La IA PROPONE, no guarda: el drawer muestra los items y Mau elige cuáles
// agregar. Un error del modelo no debe ensuciar la minuta.

const TIPOS_VALIDOS: MinutaItemTipo[] = [
  'acuerdo',
  'decision',
  'pendiente_nuestro',
  'pendiente_cliente',
  'solicitud_data',
  'actividad_nueva',
  'riesgo',
  'nota',
]

const PROMPT = `Clasificas notas de juntas de consultoría de operaciones y transporte, en español de México.

Te doy el texto crudo de una junta. Pártelo en items, cada uno con su tipo:

- "acuerdo": algo que ambas partes acordaron explícitamente
- "decision": una decisión tomada en la junta
- "pendiente_nuestro": acción que le toca a nosotros (VP o Liverpool interno) — quién y para cuándo si el texto lo dice
- "pendiente_cliente": acción que le toca al tercero/proveedor
- "solicitud_data": información o archivo que alguien tiene que enviar
- "actividad_nueva": trabajo no previsto que aparece en la junta
- "riesgo": algo que puede descarrilar el proyecto
- "nota": contexto o dato que no es accionable (dimensionamiento, capacidades, antecedentes)

Reglas:
- NO inventes compromisos que el texto no dice. Si algo es ambiguo, va como "nota".
- Un item por idea accionable. No juntes dos compromisos en uno.
- \`texto\` autocontenido: al leerlo suelto, dentro de tres semanas, tiene que entenderse sin la junta.
- \`responsable\`: solo el nombre si el texto lo nombra. Si no, omítelo.
- \`fechaCompromiso\`: solo si el texto da una fecha concreta, en formato YYYY-MM-DD. Si dice "en octubre" sin día, omítela.
- Los datos de dimensionamiento (número de tractos, flota, rendimiento) son "nota", no acuerdos.

Responde SOLO un array JSON, sin markdown ni explicación:
[{"tipo":"pendiente_cliente","texto":"...","responsable":"...","fechaCompromiso":"2026-08-20"}]`

export type ItemPropuesto = {
  tipo: MinutaItemTipo
  texto: string
  responsable?: string
  fechaCompromiso?: string
}

export type ResultadoClasificacion = { ok: true; items: ItemPropuesto[] } | { ok: false; error: string }

// Acepta texto suelto (lo que se acaba de escribir en el editor, aún sin
// guardar) o el contenido ya capturado de una minuta existente.
export async function clasificarMinutaAction(input: {
  texto?: string
  minutaId?: string
}): Promise<ResultadoClasificacion> {
  const session = await verifySession()
  if (!session) return { ok: false, error: 'no autenticado' }

  let contenido = (input.texto ?? '').trim()

  if (contenido === '' && input.minutaId) {
    const minuta = await prisma.minuta.findFirst({
      where: { id: input.minutaId, userId: session.userId },
      include: { items: { orderBy: { orden: 'asc' } } },
    })
    if (!minuta) return { ok: false, error: 'minuta no encontrada' }
    // Solo se reclasifica lo que sigue siendo texto crudo: los items que ya
    // tienen tipo distinto de nota ya fueron clasificados (por Mau o por la IA)
    // y volver a pasarlos duplicaría.
    contenido = [minuta.notas ?? '', ...minuta.items.filter((i) => i.tipo === 'nota').map((i) => i.texto)]
      .filter((t) => t.trim() !== '')
      .join('\n\n')
  }

  if (contenido === '') return { ok: false, error: 'No hay texto que clasificar.' }

  try {
    const { text } = await callModel({
      userId: session.userId,
      feature: 'clasificar_minuta',
      model: GENERATE,
      system: PROMPT,
      messages: [{ role: 'user', content: contenido }],
      maxTokens: 4000,
    })

    const crudo = extraerJSON<ItemPropuesto[]>(text)
    if (!Array.isArray(crudo)) {
      return { ok: false, error: 'La IA respondió en un formato que no pude leer. Intenta otra vez.' }
    }

    const items = crudo
      .filter((i) => typeof i?.texto === 'string' && i.texto.trim() !== '')
      .map((i) => ({
        // Un tipo inventado por el modelo cae a 'nota' en vez de tirar: perder la
        // clasificación de un item es mejor que perder el item.
        tipo: TIPOS_VALIDOS.includes(i.tipo) ? i.tipo : ('nota' as MinutaItemTipo),
        texto: i.texto.trim(),
        responsable: typeof i.responsable === 'string' && i.responsable.trim() !== '' ? i.responsable.trim() : undefined,
        fechaCompromiso: /^\d{4}-\d{2}-\d{2}$/.test(i.fechaCompromiso ?? '') ? i.fechaCompromiso : undefined,
      }))

    return { ok: true, items }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error desconocido'
    return { ok: false, error: msg.includes('ANTHROPIC_API_KEY') ? 'Falta la API key de Anthropic.' : msg }
  }
}

// Guarda los items que Mau aceptó, en una transacción y respetando el orden en
// que vienen. Devuelve cuántos se crearon.
export async function guardarItemsClasificadosAction(minutaId: string, items: ItemPropuesto[]): Promise<number> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')
  if (items.length === 0) return 0

  const minuta = await prisma.minuta.findFirst({ where: { id: minutaId, userId: session.userId }, select: { id: true } })
  if (!minuta) throw new Error('minuta no encontrada')

  const desde = await prisma.minutaItem.count({ where: { minutaId } })

  await prisma.minutaItem.createMany({
    data: items.map((i, n) => ({
      minutaId,
      tipo: i.tipo,
      texto: i.texto,
      responsable: i.responsable,
      fechaCompromiso: i.fechaCompromiso ? new Date(i.fechaCompromiso) : undefined,
      orden: desde + n,
    })),
  })

  return items.length
}
