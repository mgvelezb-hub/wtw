'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

const NAV = [
  {
    grupo: 'Personal',
    items: [
      { href: '/dia', label: 'Mi Día', icon: '☀️' },
      { href: '/semana', label: 'Mi Semana', icon: '🗓️' },
      { href: '/inbox', label: 'Inbox', icon: '📥' },
    ],
  },
  {
    grupo: 'Proyecto',
    items: [
      { href: '/proyectos', label: 'Proyectos', icon: '📊' },
      { href: '/aliado', label: 'Aliado', icon: '🤝' },
    ],
  },
  {
    grupo: 'Firma & Carrera',
    items: [
      { href: '/historico', label: 'Histórico', icon: '📈' },
      { href: '/desarrollo', label: 'Desarrollo', icon: '🎯' },
    ],
  },
  {
    grupo: 'Equipo',
    items: [
      { href: '/equipo', label: 'Equipo', icon: '👥' },
      { href: '/roi', label: 'ROI', icon: '💹' },
    ],
  },
  { grupo: '', items: [{ href: '/settings', label: 'Ajustes', icon: '⚙️' }] },
]

function NavLink({ href, label, icon, active }: { href: string; label: string; icon: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-[#0A7C82] text-white' : 'text-neutral-600 hover:bg-neutral-100'
      }`}
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </Link>
  )
}

export function AppShell({ nombre, children }: { nombre: string; children: ReactNode }) {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const flat = NAV.flatMap((g) => g.items)

  return (
    <div className="min-h-dvh bg-neutral-50 md:pl-56">
      <nav className="fixed inset-x-0 top-0 z-20 flex gap-1 overflow-x-auto border-b border-neutral-200 bg-white px-2 py-2 md:inset-y-0 md:right-auto md:w-56 md:flex-col md:gap-0 md:overflow-y-auto md:border-b-0 md:border-r md:px-3 md:py-4">
        <div className="hidden px-2 pb-4 md:block">
          <p className="text-base font-bold text-[#0A7C82]">WTW</p>
          <p className="truncate text-xs text-neutral-400">{nombre}</p>
        </div>

        {/* Móvil: fila plana scrollable */}
        <div className="flex gap-1 md:hidden">
          {flat.map((it) => (
            <NavLink key={it.href} {...it} active={isActive(it.href)} />
          ))}
        </div>

        {/* Desktop: agrupado por capa */}
        <div className="hidden md:block">
          {NAV.map((g, i) => (
            <div key={i} className="mb-3">
              {g.grupo && (
                <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{g.grupo}</p>
              )}
              {g.items.map((it) => (
                <NavLink key={it.href} {...it} active={isActive(it.href)} />
              ))}
            </div>
          ))}
        </div>
      </nav>

      <div className="pt-14 md:pt-0">{children}</div>
    </div>
  )
}
