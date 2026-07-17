// Siembra el perfil de voz de Mau (status_equipo) — destilado de su status real del 15-jul.
// Idempotente: busca por (userId, projectId=null, tipo) y actualiza o crea (no usar upsert
// nativo porque el @@unique compuesto incluye campos nulos, y en Postgres NULL nunca colisiona
// en un índice único compuesto — upsert() fallaría con P2002 en la segunda corrida).
// Uso: npx tsx scripts/seed-ai-profile.ts
import { prisma } from '../src/lib/prisma'

const EMAIL = 'mgonzalez@vpconsulting.mx'
const TIPO = 'voice_status_equipo'

const CONTENIDO = {
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

async function main() {
  const user = await prisma.user.findUnique({ where: { email: EMAIL } })
  if (!user) {
    console.error(`Usuario no encontrado: ${EMAIL}`)
    process.exit(1)
  }

  const existente = await prisma.aiProfile.findFirst({
    where: { userId: user.id, projectId: null, tipo: TIPO },
  })

  const profile = existente
    ? await prisma.aiProfile.update({
        where: { id: existente.id },
        data: { contenido: CONTENIDO, version: { increment: 1 } },
      })
    : await prisma.aiProfile.create({
        data: { userId: user.id, projectId: null, tipo: TIPO, contenido: CONTENIDO },
      })

  console.log(existente ? 'AiProfile actualizado:' : 'AiProfile creado:', profile.id)

  const verificacion = await prisma.aiProfile.findUnique({ where: { id: profile.id } })
  console.log('Verificación (leído de vuelta):', JSON.stringify(verificacion, null, 2))
}

main().finally(() => prisma.$disconnect())
