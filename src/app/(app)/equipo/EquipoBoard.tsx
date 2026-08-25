'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { inviteColleagueAction } from './actions'

type Report = {
  id: string
  nombre: string
  email: string
  proyectosActivos: number
  winsSemana: { id: string; titulo: string; estatus: string }[]
  utilizacion: { facturableHoras: number; aliadoHoras: number; internoHoras: number }
}

export function EquipoBoard({ reports }: { reports: Report[] }) {
  const emailRef = useRef<HTMLInputElement>(null)
  const nombreRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [tempPassword, setTempPassword] = useState<string | null>(null)

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-2xl font-semibold text-ink">Equipo</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          const email = emailRef.current?.value ?? ''
          const nombre = nombreRef.current?.value ?? ''
          if (!email.trim() || !nombre.trim()) return
          startTransition(async () => {
            const pwd = await inviteColleagueAction(email.trim(), nombre.trim())
            setTempPassword(pwd)
            if (emailRef.current) emailRef.current.value = ''
            if (nombreRef.current) nombreRef.current.value = ''
          })
        }}
        className="flex gap-2 rounded-lg border border-edge bg-surface p-3"
      >
        <input ref={nombreRef} placeholder="Nombre" disabled={pending} className="flex-1 rounded-md border border-hair px-3 py-2 text-sm" />
        <input ref={emailRef} type="email" placeholder="correo@vpconsulting.mx" disabled={pending} className="flex-1 rounded-md border border-hair px-3 py-2 text-sm" />
        <button type="submit" disabled={pending} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-strong">
          Agregar
        </button>
      </form>

      {tempPassword && (
        <div className="rounded-lg border border-warn-border bg-warn-soft p-3 text-sm text-warn">
          Cuenta creada. Password temporal (compártela fuera de banda, no se vuelve a mostrar):{' '}
          <code className="num font-semibold">{tempPassword}</code>
        </div>
      )}

      <section className="flex flex-col">
        <div className="lbl grid grid-cols-[1fr_110px_190px] gap-4 pb-2">
          <span>Nombre</span>
          <span>Proyectos</span>
          <span>Utilización</span>
        </div>
        {reports.map((r) => (
          <Link
            key={r.id}
            href={`/equipo/${r.id}`}
            className="hair grid grid-cols-[1fr_110px_190px] items-center gap-4 py-3 hover:bg-surface"
          >
            <div>
              <span className="font-medium text-ink">{r.nombre}</span>
              {r.winsSemana.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {r.winsSemana.map((w) => (
                    <li key={w.id} className={`text-xs ${w.estatus === 'logrado' ? 'text-faint line-through' : 'text-muted'}`}>
                      · {w.titulo}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <span className="text-sm text-muted">
              <span className="num">{r.proyectosActivos}</span> proyectos
            </span>
            <span className="text-xs text-faint">
              <span className="num">{r.utilizacion.facturableHoras.toFixed(1)}</span>h facturable ·{' '}
              <span className="num">{r.utilizacion.aliadoHoras.toFixed(1)}</span>h aliado
            </span>
          </Link>
        ))}
        {reports.length === 0 && <p className="py-3 text-sm text-faint">Sin compañeros agregados todavía.</p>}
      </section>
    </div>
  )
}
