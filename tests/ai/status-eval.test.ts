import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '@/lib/prisma'
import { callModel } from '@/lib/ai/client'
import { GENERATE } from '@/lib/ai/models'
import { buildStatusEquipoPrompt } from '@/lib/ai/prompts/status-equipo'
import { deleteTestUser } from '../helpers/cleanup'
import { contextoW29Liverpool } from './fixtures/contexto-w29-liverpool'

// Arnés de evals del generador de status de equipo — Tarea 8, Fase A (PMO IA).
// Ver docs/plans/2026-07-16-fase7-pmo-ia-design.md §6 Tarea 8 y §7.
//
// GATED: esta suite llama al modelo REAL (Anthropic) — nunca corre en la
// suite normal de CI/desarrollo (`npx vitest run`). Solo se ejecuta bajo
// demanda con `EVAL=1 ANTHROPIC_API_KEY=... npx vitest run tests/ai/status-eval.test.ts`.
//
// Las verificaciones son 100% deterministas (regex / includes) — sin
// LLM-judge en v1, tal como decide el diseño (§9: "LLM-judge en evals (v1
// determinista)").

const RUN_EVALS = process.env.EVAL === '1'

const TEST_EMAIL = 'test-eval-status-equipo@vp.mx'

// Perfil de voz de Mau — copiado tal cual de scripts/seed-ai-profile.ts
// (§5 del diseño). Se duplica aquí a propósito: el eval debe seguir
// funcionando aunque el script de seed cambie de forma incompatible, y el
// contrato de voz que se está evaluando es el del diseño, no el de la DB.
const PERFIL_VOZ_MAU = {
  estructura: [
    "Saludo breve tipo 'Equipo, les doy update del proyecto'",
    "Secciones en negritas: 'Avances y pendientes internos' / 'Acuerdos de la reunión de status' / 'Facturación'",
    'Un bullet por workstream: nombre en negrita + qué pasó (pasado) + qué sigue + quién',
  ],
  movimientos_caracteristicos: [
    "Esperas: 'Sigo sin respuesta de X sobre...'",
    "Delegación con mención: '@Nombre, hay que meterlo a nuestros pendientes'",
    "Preguntas al equipo inline: '¿Cómo ves?', 'o ven algo adicional para...?'",
    "Cierre de temas abiertos: 'lo vamos platicando'",
    "Compromisos propios: 'Quedó en nosotros...'",
    "Cierre del mensaje: '@X, @Y — si se me fue algo, adelante'",
  ],
  tono: 'Directo, profesional-cercano, sin corporativismo; una idea por bullet; sin bullets anidados',
  evitar: ['Encabezados markdown formales', 'Lenguaje de reporte ejecutivo', 'Adjetivos de relleno'],
}

const OUTPUT_PATH = path.resolve(__dirname, 'last-eval-output.txt')

// ── Heurística de detección de nombres propios no capturados ──────────────
//
// Objetivo: detectar en el borrador secuencias de palabras con mayúscula
// inicial que PARECEN nombres propios y que no están en la whitelist de
// insumos (whitelist ∪ excepciones de palabras comunes con mayúscula en
// español). Cero alucinación de nombres es la regla dura más importante del
// prompt (§5, §9) — este chequeo es la única verificación determinista
// posible sin un NER real.
//
// Método (palabra por palabra, no frase completa):
// 1. Se parte el texto en líneas (bullets estilo Slack) y cada línea en
//    oraciones por puntuación final (. ! ?).
// 2. Dentro de cada oración, la PRIMERA palabra se ignora (mayúscula de
//    inicio de oración no es señal de nombre propio).
// 3. Para el resto de palabras, se limpian signos de puntuación en los
//    bordes (*, @, :, comas, comillas) y se prueba contra
//    /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/ — UNA sola mayúscula inicial seguida de
//    minúsculas. Esto excluye a propósito acrónimos con varias mayúsculas
//    (KPIs, TDs, CRs, PPT, SOW) y tokens alfanuméricos (W29): no parecen
//    nombres propios bajo este patrón.
// 4. Cada palabra candidata se compara contra un set de palabras permitidas
//    construido de: (a) cada palabra individual de cada entrada de la
//    whitelist (así "Miguel Jiménez" habilita "Miguel" y "Jiménez" por
//    separado), y (b) una lista fija de excepciones comunes en español con
//    mayúscula (meses abreviados y completos, días de la semana).
//
// LÍMITES DOCUMENTADOS de esta heurística (deliberados, no bugs):
// - Compara PALABRA por palabra, no frase completa: un apellido inventado
//   pegado a un nombre real de la whitelist SÍ se detecta (p. ej. "Miguel
//   Falso" marca "Falso"), pero dos nombres reales de la whitelist que
//   nunca aparecieron juntos en los insumos pasarían sin marcarse — esta
//   suite no verifica combinaciones, solo presencia individual.
// - Split de oraciones por . ! ? es ingenuo: abreviaturas con punto (p. ej.
//   "Sr.", "Sra.", "Av.") partirían la oración ahí, hay riesgo de falsos
//   negativos (una palabra que en realidad es sentence-initial se evalúa
//   como si no lo fuera) o falsos positivos ocasionales — aceptable para un
//   golden set de referencia, no para producción.
// - Si un nombre propio inventado coincide por accidente con una excepción
//   de palabra común (p. ej. si alguien se llamara "Enero") no se detecta.
// - No maneja nombres compuestos con partículas minúsculas ("de la Torre");
//   la partícula minúscula no se evalúa (correcto), pero tampoco se agrupa
//   con la palabra siguiente para validarla como unidad.
const EXCEPCIONES_PALABRAS_COMUNES = new Set([
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre',
  'Octubre', 'Noviembre', 'Diciembre',
  'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo',
  'KPIs', 'KPI', 'TDs', 'TD', 'CRs', 'CR', 'PPT', 'VM', 'SOW', 'W29',
  // Stopwords españolas que arrancan cláusula tras dos puntos/guión — el
  // separador de oraciones no cubre todos los casos y ninguna de estas puede
  // ser un nombre propio alucinado.
  'Ya', 'En', 'De', 'El', 'La', 'Los', 'Las', 'Un', 'Una', 'Con', 'Sin', 'Para',
  'Por', 'Como', 'Cuando', 'Donde', 'Este', 'Esta', 'Esto', 'Ese', 'Esa', 'Eso',
  'Hoy', 'Ayer', 'Aún', 'Así', 'Sigo', 'Sigue', 'Seguimos', 'Va', 'Van',
  'Quedó', 'Quedaron', 'Nos', 'Les', 'Nada', 'Todo', 'Todos', 'Pendiente', 'Listo',
])

// La regla de cero alucinación es "todo hecho debe rastrear a los insumos", no
// "toda palabra capitalizada debe estar en la whitelist de personas": los textos
// de tareas/minutas traen sustantivos capitalizados legítimos ("Forecast",
// "TruckFill Big Ticket", "Spot") que el borrador repite con derecho. Por eso lo
// permitido = whitelist ∪ toda palabra capitalizada presente en los insumos.
function buildAllowedWordSet(whitelist: string[], insumos: unknown): Set<string> {
  const allowed = new Set<string>(EXCEPCIONES_PALABRAS_COMUNES)
  for (const entrada of whitelist) {
    for (const palabra of entrada.split(/\s+/)) {
      if (palabra) allowed.add(palabra)
    }
  }
  for (const palabra of JSON.stringify(insumos).split(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]+/)) {
    if (palabra && PATRON_CANDIDATO_NOMBRE.test(palabra)) allowed.add(palabra)
  }
  return allowed
}

function limpiarBordes(palabra: string): string {
  return palabra.replace(/^[^A-Za-zÁÉÍÓÚÑáéíóúñ]+|[^A-Za-zÁÉÍÓÚÑáéíóúñ]+$/g, '')
}

const PATRON_CANDIDATO_NOMBRE = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/

function detectarNombresNoWhitelist(texto: string, whitelist: string[], insumos: unknown): string[] {
  const allowed = buildAllowedWordSet(whitelist, insumos)
  const sospechosos = new Set<string>()

  for (const linea of texto.split(/\n+/)) {
    // : y — también abren cláusula con mayúscula legítima ("*Anticipo:* Seguimos…")
    const oraciones = linea.split(/(?<=[.!?:—])\s+/)
    for (const oracion of oraciones) {
      const palabras = oracion.trim().split(/\s+/).filter(Boolean)
      for (let i = 1; i < palabras.length; i++) {
        const limpia = limpiarBordes(palabras[i])
        if (!limpia || !PATRON_CANDIDATO_NOMBRE.test(limpia)) continue
        if (!allowed.has(limpia)) sospechosos.add(limpia)
      }
    }
  }

  return [...sospechosos]
}

if (!RUN_EVALS) {
  // eslint-disable-next-line no-console
  console.warn(
    'evals saltados — corre con EVAL=1 y ANTHROPIC_API_KEY para ejecutar tests/ai/status-eval.test.ts contra el modelo real'
  )
}

const describeEval = RUN_EVALS ? describe : describe.skip

describeEval('eval: generación real del status de equipo (golden set W29 Liverpool)', () => {
  let userId: string

  beforeAll(async () => {
    await deleteTestUser(TEST_EMAIL)
    const user = await prisma.user.create({
      data: { email: TEST_EMAIL, nombre: 'Mau Gonzalez (eval)', passwordHash: 'x' },
    })
    userId = user.id
  })

  afterAll(async () => {
    await deleteTestUser(TEST_EMAIL)
  })

  it('genera un status cuyo texto respeta cobertura, whitelist y estructura', async () => {
    const fewshot = fs.readFileSync(
      path.resolve(__dirname, 'fixtures/status-2026-07-15-liverpool.md'),
      'utf-8'
    )

    const { system, messages } = buildStatusEquipoPrompt({
      nombreUsuario: 'Mau',
      perfilVoz: PERFIL_VOZ_MAU,
      fewshots: [fewshot],
      insumos: contextoW29Liverpool,
    })

    const { text } = await callModel({
      userId,
      feature: 'eval_status_equipo',
      model: GENERATE,
      system,
      messages,
      maxTokens: 8000, // mismo presupuesto que producción — el razonamiento consume max_tokens
    })

    fs.writeFileSync(OUTPUT_PATH, text, 'utf-8')

    // a. Cobertura de esperas: cada espera del contexto aparece por responsable.
    for (const espera of contextoW29Liverpool.esperas) {
      expect(text, `espera de "${espera.responsable}" no aparece en el borrador`).toContain(
        espera.responsable as string
      )
    }

    // b. Cero alucinación de nombres: todo nombre-candidato detectado debe
    // estar en la whitelist (o en las excepciones documentadas arriba).
    const sospechosos = detectarNombresNoWhitelist(text, contextoW29Liverpool.whitelist, contextoW29Liverpool)
    expect(sospechosos, `nombres fuera de whitelist detectados: ${sospechosos.join(', ')}`).toEqual([])

    // c. Estructura: sección de avances siempre; sección de acuerdos porque
    // hay minutas nuevas con items.
    expect(/avances/i.test(text)).toBe(true)
    expect(/acuerdos/i.test(text)).toBe(true)

    // d. Los acuerdos de la minuta aparecen en el texto generado.
    expect(text).toContain('TruckFill')
    expect(text.includes('56 TDs') || /ventana/i.test(text)).toBe(true)
    expect(text).toContain('Kevin')
  })
})
