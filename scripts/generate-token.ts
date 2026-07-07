// Genera un PAT para el usuario indicado y guarda su hash.
// Uso: npx tsx scripts/generate-token.ts correo@vpconsulting.mx
import { prisma } from '../src/lib/prisma'
import { hashToken, newToken } from '../src/lib/api-auth'

async function main() {
  const email = process.argv[2]
  if (!email) {
    console.error('Uso: npx tsx scripts/generate-token.ts <email>')
    process.exit(1)
  }
  const token = newToken()
  await prisma.user.update({
    where: { email },
    data: { apiTokenHash: hashToken(token) },
  })
  console.log('PAT generado (se muestra UNA sola vez — guárdalo en ~/.wtw-token):')
  console.log(token)
}

main().finally(() => prisma.$disconnect())
