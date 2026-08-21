'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode, type UIEvent } from 'react'

const NAV = [
  {
    grupo: 'Personal',
    items: [
      { href: '/dia', label: 'Mi Día', icon: '☀️' },
      { href: '/cierre', label: 'Cierre', icon: '🌙' },
      { href: '/semana', label: 'Mi Semana', icon: '🗓️' },
      { href: '/inbox', label: 'Actividades', icon: '📋' },
    ],
  },
  {
    grupo: 'Proyecto',
    items: [
      { href: '/proyectos', label: 'Proyectos', icon: '📊' },
      { href: '/stakeholders', label: 'Stakeholders', icon: '🎭' },
      { href: '/aliado', label: 'Aliado', icon: '🤝' },
    ],
  },
  {
    grupo: 'Firma & Carrera',
    items: [
      { href: '/historico', label: 'Histórico', icon: '📈' },
      { href: '/resumen', label: 'Resumen IA', icon: '✨' },
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
      className={`flex shrink-0 scroll-mx-2 snap-start items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-brand text-white' : 'text-neutral-600 hover:bg-neutral-100'
      }`}
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </Link>
  )
}

export function AppShell({
  nombre,
  archivados,
  children,
}: {
  nombre: string
  // Rutas archivadas detrás de un flag (ver src/lib/flags.ts). Se resuelven en el
  // servidor porque el flag es de entorno y este componente corre en el cliente.
  archivados: string[]
  children: ReactNode
}) {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const grupos = NAV.map((g) => ({ ...g, items: g.items.filter((it) => !archivados.includes(it.href)) })).filter(
    (g) => g.items.length > 0
  )
  const flat = grupos.flatMap((g) => g.items)

  // La fila de tabs en móvil se corta sin ninguna señal de que sigue scrolleando
  // ("Act..." a medias). El fade de la derecha es estático (siempre hay más a la
  // derecha salvo que ya se llegó al final); el de la izquierda solo aparece tras
  // haber scrolleado, así que sí necesita estado — CSS puro no puede saber "ya se
  // movió el scroll".
  const [scrollState, setScrollState] = useState({ atStart: true, atEnd: false })
  const scrollRef = useRef<HTMLDivElement>(null)

  function medirScroll(el: HTMLDivElement): void {
    const atStart = el.scrollLeft <= 4
    const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 4
    setScrollState({ atStart, atEnd })
  }

  function onScrollTabs(e: UIEvent<HTMLDivElement>): void {
    medirScroll(e.currentTarget)
  }

  // Si la fila cabe entera (pocas rutas, o pantalla ancha en modo móvil), no hay
  // nada que scrollear y el fade derecho no debe aparecer — sin esto se queda
  // prendido siempre porque `atEnd` arranca en false.
  useEffect(() => {
    if (scrollRef.current) medirScroll(scrollRef.current)
  }, [flat.length])

  return (
    <div className="min-h-dvh bg-[#f4efe3] md:pl-56">
      <nav className="fixed inset-x-0 top-0 z-20 flex gap-1 overflow-x-auto border-b border-neutral-200 bg-white px-2 py-2 md:inset-y-0 md:right-auto md:w-56 md:flex-col md:gap-0 md:overflow-y-auto md:border-b-0 md:border-r md:px-3 md:py-4">
        <div className="hidden px-2 pb-4 md:block">
          <p className="text-base font-bold text-brand">WTW</p>
          <p className="truncate text-xs text-neutral-400">{nombre}</p>
        </div>

        {/* Móvil: fila plana scrollable, con fade en los bordes que tienen más
            contenido y scroll-snap para que cada tab quede completo al soltar. */}
        <div className="relative min-w-0 md:hidden">
          <div
            ref={scrollRef}
            onScroll={onScrollTabs}
            className="flex snap-x snap-mandatory gap-1 overflow-x-auto scroll-smooth pr-6"
          >
            {flat.map((it) => (
              <NavLink key={it.href} {...it} active={isActive(it.href)} />
            ))}
          </div>
          {!scrollState.atStart && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-white to-transparent"
            />
          )}
          {!scrollState.atEnd && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white to-transparent"
            />
          )}
        </div>

        {/* Desktop: agrupado por capa */}
        <div className="hidden md:block">
          {grupos.map((g, i) => (
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
