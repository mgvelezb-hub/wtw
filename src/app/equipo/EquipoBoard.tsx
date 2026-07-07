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
      <h1 className="text-lg font-bold text-neutral-900">Equipo</h1>

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
        className="flex gap-2 rounded-lg border border-neutral-200 bg-white p-3 shadow-sm"
      >
        <input ref={nombreRef} placeholder="Nombre" disabled={pending} className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        <input ref={emailRef} type="email" placeholder="correo@vpconsulting.mx" disabled={pending} className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        <button type="submit" disabled={pending} className="rounded-md bg-[#0A7C82] px-4 py-2 text-sm font-semibold text-white hover:bg-[#086a6f]">
          Agregar
        </button>
      </form>

      {tempPassword && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Cuenta creada. Password temporal (compártela fuera de banda, no se vuelve a mostrar):{' '}
          <code className="font-mono font-semibold">{tempPassword}</code>
        </div>
      )}

      <section className="space-y-3">
        {reports.map((r) => (
          <Link key={r.id} href={`/equipo/${r.id}`} className="block rounded-lg border border-neutral-200 bg-white p-3 shadow-sm hover:border-neutral-300">
            <div className="flex items-center justify-between">
              <span className="font-medium text-neutral-900">{r.nombre}</span>
              <span className="text-sm text-neutral-500">{r.proyectosActivos} proyectos activos</span>
            </div>
            {r.winsSemana.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {r.winsSemana.map((w) => (
                  <li key={w.id} className={`text-xs ${w.estatus === 'logrado' ? 'text-neutral-400 line-through' : 'text-neutral-600'}`}>
                    · {w.titulo}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-neutral-400">
              {r.utilizacion.facturableHoras.toFixed(1)}h facturable · {r.utilizacion.aliadoHoras.toFixed(1)}h aliado
            </p>
          </Link>
        ))}
        {reports.length === 0 && <p className="text-sm text-neutral-400">Sin compañeros agregados todavía.</p>}
      </section>
    </div>
  )
}
