'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode, type SVGProps, type UIEvent } from 'react'

type IconName =
  | 'sol'
  | 'luna'
  | 'calendario'
  | 'bandeja'
  | 'portafolio'
  | 'red-personas'
  | 'escudo'
  | 'linea'
  | 'chispa'
  | 'diana'
  | 'personas'
  | 'engrane'
  | 'barras'
  | 'chevron'

type SubItem = { href: string; label: string; color?: string }

type NavItem = {
  href: string
  label: string
  desc: string
  icon: IconName
  sub?: SubItem[]
}

type Grupo = { grupo: string; items: NavItem[] }

type ProyectoNav = { id: string; nombre: string; color: string }

// Grupos que el usuario puede colapsar en el sidebar de escritorio. "Ajustes"
// vive suelto (grupo: '') y nunca se colapsa.
const GRUPOS_COLAPSABLES = ['Personal', 'Proyecto', 'Firma & Carrera', 'Equipo']

const NAV_COLAPSADO_KEY = 'wtw-nav-colapsado'

function buildNav(proyectos: ProyectoNav[]): Grupo[] {
  return [
    {
      grupo: 'Personal',
      items: [
        { href: '/dia', label: 'Mi Día', desc: 'Tu jornada de hoy: bloques, cronómetro y pendientes', icon: 'sol' },
        { href: '/cierre', label: 'Cierre', desc: '60 segundos al final del día: qué pasó de verdad', icon: 'luna' },
        {
          href: '/semana',
          label: 'Mi Semana',
          desc: 'El plan semanal: wins, carga y bloques por día',
          icon: 'calendario',
          sub: [{ href: '/semana/nueva', label: 'Planeador' }],
        },
        {
          href: '/inbox',
          label: 'Actividades',
          desc: 'Captura rápida de tareas sueltas antes de agendarlas',
          icon: 'bandeja',
        },
      ],
    },
    {
      grupo: 'Proyecto',
      items: [
        {
          href: '/proyectos',
          label: 'Proyectos',
          desc: 'Engagements activos: entregables, pendientes y minutas',
          icon: 'portafolio',
          sub: proyectos.map((p) => ({ href: `/proyectos/${p.id}`, label: p.nombre, color: p.color })),
        },
        {
          href: '/stakeholders',
          label: 'Stakeholders',
          desc: 'Mapa de contactos clave y cadencia de relación',
          icon: 'red-personas',
        },
        {
          href: '/aliado',
          label: 'Aliado',
          desc: 'Trabajo extra que te posiciona como aliado estratégico',
          icon: 'escudo',
        },
      ],
    },
    {
      grupo: 'Firma & Carrera',
      items: [
        {
          href: '/historico',
          label: 'Histórico',
          desc: 'Semanas pasadas: factor de realismo y wins logrados',
          icon: 'linea',
        },
        {
          href: '/resumen',
          label: 'Resumen IA',
          desc: 'Genera resúmenes cruzando minutas con lo que sigue vivo',
          icon: 'chispa',
        },
        {
          href: '/desarrollo',
          label: 'Desarrollo',
          desc: 'Tu camino a Gerente: reactivos, evidencia y práctica',
          icon: 'diana',
        },
      ],
    },
    {
      grupo: 'Equipo',
      items: [
        { href: '/equipo', label: 'Equipo', desc: 'Los reportes directos y su semana', icon: 'personas' },
        { href: '/roi', label: 'ROI', desc: 'Retorno de la inversión en aliado por proyecto', icon: 'barras' },
      ],
    },
    {
      grupo: '',
      items: [
        { href: '/settings', label: 'Ajustes', desc: 'Horario, buffer, factor manual y calendario', icon: 'engrane' },
      ],
    },
  ]
}

function Icono({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  const shared = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    width: 20,
    height: 20,
    'aria-hidden': true,
    ...props,
  }

  switch (name) {
    case 'sol':
      return (
        <svg {...shared}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8L6 18M18 6l1.8-1.8" />
        </svg>
      )
    case 'luna':
      return (
        <svg {...shared}>
          <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a6.8 6.8 0 0 0 11 11z" />
        </svg>
      )
    case 'calendario':
      return (
        <svg {...shared}>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
          <path d="M3.5 10h17M8 2.5v5M16 2.5v5" />
        </svg>
      )
    case 'bandeja':
      return (
        <svg {...shared}>
          <path d="M3.5 12.5h5l1.7 2.5h3.6l1.7-2.5h5" />
          <path d="M3.5 12.5 5.8 5a1.5 1.5 0 0 1 1.4-1h9.6a1.5 1.5 0 0 1 1.4 1l2.3 7.5v5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" />
        </svg>
      )
    case 'portafolio':
      return (
        <svg {...shared}>
          <rect x="3" y="7.5" width="18" height="12" rx="2" />
          <path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5M3 13h18" />
        </svg>
      )
    case 'red-personas':
      return (
        <svg {...shared}>
          <circle cx="6" cy="6.5" r="2.25" />
          <circle cx="18" cy="6.5" r="2.25" />
          <circle cx="12" cy="18" r="2.25" />
          <path d="M7.7 8L10.5 16M16.3 8L13.5 16M8.25 6.5h7.5" />
        </svg>
      )
    case 'escudo':
      return (
        <svg {...shared}>
          <path d="M12 2.5 4.5 5.5v6c0 5 3.2 8.3 7.5 10 4.3-1.7 7.5-5 7.5-10v-6z" />
          <path d="M8.7 12.2l2.3 2.3 4.3-4.7" />
        </svg>
      )
    case 'linea':
      return (
        <svg {...shared}>
          <path d="M3.5 3.5v17h17" />
          <path d="M6.5 15.5l3.5-4 3 2.7 4.5-6.2" />
        </svg>
      )
    case 'chispa':
      return (
        <svg {...shared}>
          <path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z" />
          <path d="M19 15.5l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7z" />
        </svg>
      )
    case 'diana':
      return (
        <svg {...shared}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5.2" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'personas':
      return (
        <svg {...shared}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 20c.4-3.4 2.8-5.7 5.5-5.7s5.1 2.3 5.5 5.7" />
          <circle cx="17.5" cy="7.5" r="2.3" />
          <path d="M14.8 14.6c2.3.1 4.2 2.1 4.7 5.4" />
        </svg>
      )
    case 'engrane':
      return (
        <svg {...shared}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2.5v2.3M12 19.2v2.3M21.5 12h-2.3M4.8 12H2.5M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6M18.4 18.4l-1.6-1.6M7.2 7.2 5.6 5.6" />
        </svg>
      )
    case 'barras':
      return (
        <svg {...shared}>
          <path d="M5 20V13M12 20V8M19 20V4" />
          <path d="M3.5 20h17" />
        </svg>
      )
    case 'chevron':
      return (
        <svg {...shared}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      )
  }
}

function NavLink({ href, label, icon, active }: { href: string; label: string; icon: IconName; active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex shrink-0 scroll-mx-2 snap-start items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-brand text-white' : 'text-neutral-600 hover:bg-neutral-100'
      }`}
    >
      <Icono name={icon} />
      <span>{label}</span>
    </Link>
  )
}

// Item de escritorio: incluye el tooltip con descripción (delay ~400ms, solo en
// dispositivos con hover real) y, en pantallas táctiles, la misma descripción
// visible en línea dentro del grupo — ahí no hay hover confiable, así que no
// tiene sentido esconderla detrás de uno.
function DesktopNavItem({ item, active, subActive }: { item: NavItem; active: boolean; subActive: (href: string) => boolean }) {
  return (
    <div className="group/item relative">
      <Link
        href={item.href}
        className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
          active ? 'bg-brand text-white' : 'text-neutral-600 hover:bg-neutral-100'
        }`}
      >
        <Icono name={item.icon} />
        <span>{item.label}</span>
      </Link>

      <div
        role="tooltip"
        className="pointer-events-none invisible absolute left-full top-1/2 z-30 ml-2 w-56 -translate-y-1/2 rounded-lg bg-brand-deep px-3 py-2 text-xs leading-snug text-white opacity-0 shadow-lg transition-opacity [@media(hover:hover)_and_(pointer:fine)]:duration-150 [@media(hover:hover)_and_(pointer:fine)]:delay-[400ms] [@media(hover:hover)_and_(pointer:fine)]:group-hover/item:visible [@media(hover:hover)_and_(pointer:fine)]:group-hover/item:opacity-100"
      >
        {item.desc}
      </div>

      <p className="hidden px-3 pb-1 text-[11px] leading-snug text-neutral-400 [@media(hover:none)]:block">
        {item.desc}
      </p>

      {item.sub && item.sub.length > 0 && (
        <div className="ml-6 mt-0.5 flex flex-col gap-0.5 border-l border-neutral-200 pl-2">
          {item.sub.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className={`flex items-center gap-2 truncate rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                subActive(s.href) ? 'bg-brand-soft text-brand-deep' : 'text-neutral-500 hover:bg-neutral-100'
              }`}
            >
              {s.color && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />}
              <span className="truncate">{s.label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export function AppShell({
  nombre,
  archivados,
  proyectos,
  children,
}: {
  nombre: string
  // Rutas archivadas detrás de un flag (ver src/lib/flags.ts). Se resuelven en el
  // servidor porque el flag es de entorno y este componente corre en el cliente.
  archivados: string[]
  // Proyectos activos del usuario, para los sub-links bajo "Proyectos". Objeto
  // plano (id/nombre/color) — nunca el modelo de Prisma completo (regla 2).
  proyectos: ProyectoNav[]
  children: ReactNode
}) {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const grupos = buildNav(proyectos)
    .map((g) => ({ ...g, items: g.items.filter((it) => !archivados.includes(it.href)) }))
    .filter((g) => g.items.length > 0)
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

  // Preferencia de grupos colapsados en el sidebar de escritorio. Arranca en
  // `null` y se llena en useEffect tras montar, para no divergir del render del
  // servidor (regla 1 de CLAUDE.md: nunca leer localStorage durante el render).
  const [colapsado, setColapsado] = useState<Record<string, boolean> | null>(null)

  useEffect(() => {
    const raw = window.localStorage.getItem(NAV_COLAPSADO_KEY)
    if (!raw) {
      setColapsado({})
      return
    }
    try {
      setColapsado(JSON.parse(raw))
    } catch {
      setColapsado({})
    }
  }, [])

  function toggleGrupo(grupo: string): void {
    setColapsado((prev) => {
      const next = { ...(prev ?? {}), [grupo]: !(prev?.[grupo] ?? false) }
      window.localStorage.setItem(NAV_COLAPSADO_KEY, JSON.stringify(next))
      return next
    })
  }

  return (
    <div className="min-h-dvh bg-[#f4efe3] md:pl-56">
      <nav className="fixed inset-x-0 top-0 z-20 flex gap-1 overflow-x-auto border-b border-neutral-200 bg-white px-2 py-2 md:inset-y-0 md:right-auto md:w-56 md:flex-col md:gap-0 md:overflow-y-auto md:border-b-0 md:border-r md:px-3 md:py-4">
        <div className="hidden px-2 pb-4 md:block">
          <p className="text-base font-bold text-brand">WTW</p>
          <p className="truncate text-xs text-neutral-400">{nombre}</p>
        </div>

        {/* Móvil: fila plana scrollable, con fade en los bordes que tienen más
            contenido y scroll-snap para que cada tab quede completo al soltar.
            Sin grupos colapsables ni tooltips — el long-press no es confiable
            en web y aquí no hay espacio para descripciones. */}
        <div className="relative min-w-0 md:hidden">
          <div
            ref={scrollRef}
            onScroll={onScrollTabs}
            className="flex snap-x snap-mandatory gap-1 overflow-x-auto scroll-smooth pr-6"
          >
            {flat.map((it) => (
              <NavLink key={it.href} href={it.href} label={it.label} icon={it.icon} active={isActive(it.href)} />
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

        {/* Desktop: agrupado por capa, colapsable, con tooltip por ítem */}
        <div className="hidden md:block">
          {grupos.map((g, i) => {
            const esColapsable = g.grupo && GRUPOS_COLAPSABLES.includes(g.grupo)
            const estaColapsado = esColapsable ? (colapsado?.[g.grupo] ?? false) : false
            return (
              <div key={i} className="mb-3">
                {esColapsable ? (
                  <button
                    type="button"
                    onClick={() => toggleGrupo(g.grupo)}
                    aria-expanded={!estaColapsado}
                    className="flex w-full items-center justify-between px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400"
                  >
                    <span>{g.grupo}</span>
                    <Icono
                      name="chevron"
                      width={12}
                      height={12}
                      className={`transition-transform ${estaColapsado ? '-rotate-90' : ''}`}
                    />
                  </button>
                ) : (
                  g.grupo && (
                    <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{g.grupo}</p>
                  )
                )}
                {!estaColapsado && (
                  <div className="flex flex-col gap-0.5">
                    {g.items.map((it) => (
                      <DesktopNavItem key={it.href} item={it} active={isActive(it.href)} subActive={isActive} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </nav>

      <div className="pt-14 md:pt-0">{children}</div>
    </div>
  )
}
