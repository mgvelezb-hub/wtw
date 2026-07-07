import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCoberturaCompetencias } from './service'

export default async function DesarrolloPage() {
  const session = await verifySession()
  if (!session) return null

  const [cobertura, user] = await Promise.all([
    getCoberturaCompetencias(session.userId),
    prisma.user.findUnique({ where: { id: session.userId }, include: { nivelActual: true, nivelObjetivo: true } }),
  ])

  const individuales = cobertura.filter((c) => c.tipo === 'individual')
  const porRol = cobertura
    .filter((c) => c.tipo === 'rol')
    .reduce<Record<string, typeof cobertura>>((acc, c) => {
      const key = c.grupo ?? '—'
      ;(acc[key] ??= []).push(c)
      return acc
    }, {})

  const totalHuecos = cobertura.filter((c) => c.evidenciaCount === 0).length

  return (
    <main className="min-h-dvh bg-neutral-50">
      <div className="mx-auto max-w-2xl space-y-6 p-4">
        <div>
          <h1 className="text-lg font-bold text-neutral-900">Desarrollo</h1>
          {user?.nivelActual && user?.nivelObjetivo && (
            <p className="text-sm text-neutral-500">
              {user.nivelActual.nombre} → {user.nivelObjetivo.nombre} · {totalHuecos} competencias sin evidencia
            </p>
          )}
        </div>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase text-neutral-500">Conductas individuales</h2>
          <ul className="space-y-1">
            {individuales.map((c) => (
              <li
                key={c.id}
                className={`rounded-md px-3 py-1.5 text-sm shadow-sm ${
                  c.evidenciaCount === 0 ? 'bg-amber-50 text-amber-800' : 'bg-white text-neutral-700'
                }`}
              >
                {c.texto} <span className="text-xs text-neutral-400">({c.evidenciaCount})</span>
              </li>
            ))}
          </ul>
        </section>

        {Object.entries(porRol).map(([grupo, items]) => (
          <section key={grupo}>
            <h2 className="mb-2 text-xs font-semibold uppercase text-neutral-500">{grupo}</h2>
            <ul className="space-y-1">
              {items.map((c) => (
                <li
                  key={c.id}
                  className={`rounded-md px-3 py-1.5 text-sm shadow-sm ${
                    c.evidenciaCount === 0 ? 'bg-amber-50 text-amber-800' : 'bg-white text-neutral-700'
                  }`}
                >
                  {c.texto} <span className="text-xs text-neutral-400">({c.evidenciaCount})</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  )
}
