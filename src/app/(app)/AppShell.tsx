'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type UIEvent } from 'react'
import { CommandPalette } from '@/components/command-palette'
import { NavInferior } from '@/components/nav-inferior'
import { Icono, type Grupo, type IconName, type NavItem, type ProyectoNav } from '@/components/nav-iconos'

const NAV_COLAPSADO_KEY = 'wtw-nav-colapsado'
const RAIL_KEY = 'wtw-rail'

// Tooltip de escritorio. En estado expandido es un complemento (la etiqueta ya
// se ve) y por eso espera 400 ms; en estado rail es la ÚNICA forma de leer el
// nombre de la sección, así que aparece casi de inmediato.
const HOVER_FINO = '(hover: hover) and (pointer: fine)'
const TOOLTIP_DELAY_EXPANDIDO = 400
const TOOLTIP_DELAY_RAIL = 120

// La tecla modificadora nunca cambia mientras la página vive: no hay a qué
// suscribirse, solo a qué leer una vez del lado del cliente.
function sinSuscripcion(): () => void {
  return () => {}
}

function teclaDelCliente(): string {
  return /mac|iphone|ipad|ipod/i.test(window.navigator.userAgent) ? '⌘' : 'Ctrl '
}

// La nav no está organizada por modelo de datos (Personal / Proyecto / Firma /
// Equipo) sino por los MOMENTOS en que el usuario abre la app: hoy, la semana,
// el cierre, sus proyectos y su carrera. Todo lo demás es material de consulta
// —se busca, no se recorre— y vive en "Biblioteca", cerrada por default.
function buildNav(proyectos: ProyectoNav[]): Grupo[] {
  return [
    {
      id: 'primarios',
      grupo: '',
      contexto: 'Principal',
      items: [
        { href: '/dia', label: 'Hoy', desc: 'Tu jornada de hoy: bloques, cronómetro y pendientes', icon: 'sol' },
        {
          href: '/semana',
          label: 'Semana',
          desc: 'El plan semanal: wins, carga y bloques por día',
          icon: 'calendario',
          sub: [{ href: '/semana/nueva', label: 'Planeador' }],
        },
        { href: '/cierre', label: 'Cierre', desc: '60 segundos al final del día: qué pasó de verdad', icon: 'luna' },
        {
          href: '/proyectos',
          label: 'Proyectos',
          desc: 'Engagements activos: entregables, pendientes y minutas',
          icon: 'portafolio',
          sub: proyectos.map((p) => ({ href: `/proyectos/${p.id}`, label: p.nombre, color: p.color })),
        },
        {
          href: '/desarrollo',
          label: 'Carrera',
          desc: 'Tu camino a Gerente: reactivos, evidencia y práctica',
          icon: 'diana',
          sub: [{ href: '/desarrollo/caso', label: 'Mi caso' }],
        },
      ],
    },
    {
      id: 'biblioteca',
      grupo: 'Biblioteca',
      contexto: 'Biblioteca',
      colapsable: true,
      colapsadoPorDefecto: true,
      items: [
        {
          href: '/inbox',
          label: 'Actividades',
          desc: 'Captura rápida de tareas sueltas antes de agendarlas',
          icon: 'bandeja',
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
        { href: '/equipo', label: 'Equipo', desc: 'Los reportes directos y su semana', icon: 'personas' },
        // Archivada tras el flag (src/lib/flags.ts): hoy se filtra y no se ve.
        // Sigue declarada aquí para que WTW_RUTAS_ACTIVAS=roi la reviva sin
        // tener que volver a tocar la navegación.
        { href: '/roi', label: 'ROI', desc: 'Retorno de la inversión en aliado por proyecto', icon: 'barras' },
      ],
    },
    {
      id: 'ajustes',
      grupo: '',
      contexto: 'Ajustes',
      alFinal: true,
      items: [
        { href: '/settings', label: 'Ajustes', desc: 'Horario, buffer, factor manual y calendario', icon: 'engrane' },
      ],
    },
  ]
}

function NavLink({ href, label, icon, active }: { href: string; label: string; icon: IconName; active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex shrink-0 scroll-mx-2 snap-start items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-brand text-white' : 'text-muted hover:bg-paper'
      }`}
    >
      <Icono name={icon} />
      <span>{label}</span>
    </Link>
  )
}

// Item de escritorio. En estado expandido incluye el tooltip con descripción
// (delay ~400ms, solo en dispositivos con hover real) y, en pantallas táctiles,
// la misma descripción visible en línea — ahí no hay hover confiable, así que
// no tiene sentido esconderla detrás de uno. En estado rail solo queda el icono
// centrado: la etiqueta pasa al `aria-label` y al tooltip.
function DesktopNavItem({
  item,
  active,
  subActive,
  rail,
}: {
  item: NavItem
  active: boolean
  subActive: (href: string) => boolean
  rail: boolean
}) {
  const tieneSub = !!item.sub && item.sub.length > 0
  const algunSubActivo = tieneSub && item.sub!.some((s) => subActive(s.href))
  // Sub-items colapsados por default para que la sidebar no sea un árbol
  // permanente; se abren solos cuando el usuario ya está dentro de uno de
  // ellos (si no, el proyecto actual quedaría invisible en la nav).
  const [abierto, setAbierto] = useState(false)
  const desplegado = !rail && (abierto || algunSubActivo)

  // El tooltip se posiciona a mano y se pinta `fixed`, no `absolute`: el sidebar
  // es un contenedor de scroll (`overflow-y-auto` obliga a que el eje X también
  // recorte), así que un hijo absoluto que asome a la derecha queda cortado por
  // el borde de la columna. Un elemento `fixed` toma el viewport como bloque
  // contenedor y escapa de ese recorte. En rail eso deja de ser un detalle: sin
  // tooltip no hay forma de saber qué es cada icono.
  const fila = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ top: number; left: number } | null>(null)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  function cancelar(): void {
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = null
  }

  function colocar(): void {
    const r = fila.current?.getBoundingClientRect()
    if (r) setTip({ top: r.top + r.height / 2, left: r.right + 8 })
  }

  // `forzar` es el camino del teclado: ahí no hay hover que esperar ni media
  // query que consultar — si el ítem tiene el foco, la descripción se muestra.
  function mostrarTip(forzar = false): void {
    cancelar()
    if (forzar) {
      colocar()
      return
    }
    if (!window.matchMedia(HOVER_FINO).matches) return
    temporizador.current = setTimeout(colocar, rail ? TOOLTIP_DELAY_RAIL : TOOLTIP_DELAY_EXPANDIDO)
  }

  function ocultarTip(): void {
    cancelar()
    setTip(null)
  }

  useEffect(() => cancelar, [])

  return (
    <div
      className="relative"
      onMouseEnter={() => mostrarTip()}
      onMouseLeave={ocultarTip}
      onFocus={() => mostrarTip(true)}
      onBlur={ocultarTip}
    >
      <div ref={fila} className="flex items-center">
        <Link
          href={item.href}
          aria-label={rail ? item.label : undefined}
          aria-current={active ? 'page' : undefined}
          className={`flex flex-1 items-center rounded-md text-sm font-medium transition-colors ${
            rail ? 'justify-center px-0 py-2.5' : 'gap-2 px-3 py-2'
          } ${active ? 'bg-brand text-white' : 'text-muted hover:bg-paper'}`}
        >
          <Icono name={item.icon} />
          {!rail && <span>{item.label}</span>}
        </Link>
        {tieneSub && !rail && (
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={desplegado}
            aria-label={desplegado ? `Ocultar sub-secciones de ${item.label}` : `Mostrar sub-secciones de ${item.label}`}
            className={`ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-faint transition-transform hover:bg-paper hover:text-muted ${
              desplegado ? 'rotate-180' : ''
            }`}
          >
            <Icono name="chevron" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {tip && (
        <div
          role="tooltip"
          style={{ top: tip.top, left: tip.left }}
          className="pointer-events-none fixed z-50 w-56 -translate-y-1/2 rounded-lg bg-brand-deep px-3 py-2 text-xs leading-snug text-white shadow-lg"
        >
          {rail && <span className="mb-0.5 block text-[13px] font-semibold">{item.label}</span>}
          {item.desc}
        </div>
      )}

      {!rail && (
        <p className="hidden px-3 pb-1 text-[11px] leading-snug text-faint [@media(hover:none)]:block">
          {item.desc}
        </p>
      )}

      {item.sub && desplegado && (
        <div className="ml-6 mt-0.5 flex flex-col gap-0.5 border-l border-hair pl-2">
          {item.sub.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className={`flex items-center gap-2 truncate rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                subActive(s.href) ? 'bg-brand-soft text-brand-deep' : 'text-muted hover:bg-paper'
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

  // Ancho del sidebar de escritorio: `null` = todavía no se leyó la preferencia
  // (misma regla 1). El default es EXPANDIDO a propósito: el lunes por la mañana
  // nadie quiere descubrir que su nav cambió de forma sola.
  const [rail, setRail] = useState<boolean | null>(null)
  const esRail = rail ?? false

  // Mismo trato que `setColapsado` arriba: `react-hooks/set-state-in-effect`
  // marca este setState, y se acepta a conciencia — es el precio de la regla 1
  // (leer localStorage solo después de montar) y el patrón ya establecido aquí.
  useEffect(() => {
    setRail(window.localStorage.getItem(RAIL_KEY) === 'rail')
  }, [])

  function toggleRail(): void {
    setRail((prev) => {
      const next = !(prev ?? false)
      window.localStorage.setItem(RAIL_KEY, next ? 'rail' : 'expandido')
      return next
    })
  }

  // `[` colapsa/expande el rail. Global, como ⌘K, pero sin modificador: por eso
  // hay que ignorarlo cuando el foco está escribiendo en algún lado — si no, un
  // corchete en una minuta reacomodaría la pantalla.
  useEffect(() => {
    function alTeclear(e: KeyboardEvent): void {
      if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target
      if (t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return
      e.preventDefault()
      toggleRail()
    }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [])

  // La transición solo se enciende una vez leída la preferencia: si el usuario
  // guardó "rail", el primer commit pasa de 224 a 56 px, y sin este guardia esa
  // corrección de hidratación se vería como una animación al cargar.
  const transicion = rail === null ? '' : 'transition-[width,padding] duration-150 ease-out'

  // El atajo funciona con ⌘ o Ctrl indistintamente, pero la etiqueta debe decir
  // la tecla que esa persona tiene. `useSyncExternalStore` y no un `useState` en
  // `useEffect`: el snapshot del servidor es '⌘' (el caso común aquí) y el del
  // cliente se lee tras la hidratación, así que no hay divergencia con el HTML
  // del servidor (regla 1 de CLAUDE.md) ni un render extra en cadena.
  const teclaAtajo = useSyncExternalStore(sinSuscripcion, teclaDelCliente, () => '⌘')

  function toggleGrupo(id: string): void {
    setColapsado((prev) => {
      const next = { ...(prev ?? {}), [id]: !(prev?.[id] ?? false) }
      window.localStorage.setItem(NAV_COLAPSADO_KEY, JSON.stringify(next))
      return next
    })
  }

  return (
    <div className={`min-h-dvh bg-paper ${transicion} ${esRail ? 'md:pl-14' : 'md:pl-56'}`}>
      {/* Bajo 640px esta barra no existe: el teléfono navega por la barra
          inferior (`NavInferior`) y la pantalla recupera esos 56 px de alto,
          que en un iPhone son la diferencia entre ver el bloque de la tarde o
          tener que scrollear. De 640 a 767 (tablet angosta, iPad en split
          view) sigue la fila de tabs de siempre; desde 768 es el sidebar,
          que puede estar expandido (224 px) o en rail (56 px). */}
      <nav
        id="nav-lateral"
        aria-label="Secciones"
        className={`fixed inset-x-0 top-0 z-20 hidden gap-1 overflow-x-auto border-b border-edge bg-surface px-2 py-2 sm:flex md:inset-y-0 md:right-auto md:flex-col md:gap-0 md:overflow-y-auto md:overflow-x-hidden md:border-b-0 md:border-r md:border-edge md:py-4 ${transicion} ${
          esRail ? 'md:w-14 md:px-2' : 'md:w-56 md:px-3'
        }`}
      >
        <div className={`hidden pb-4 md:block ${esRail ? 'px-0 text-center' : 'px-2'}`}>
          <p className="text-base font-bold text-brand">{esRail ? 'W' : 'WTW'}</p>
          {!esRail && <p className="truncate text-xs text-faint">{nombre}</p>}
        </div>

        {/* Tablet angosta (640–767): fila plana scrollable, con fade en los
            bordes que tienen más contenido y scroll-snap para que cada tab
            quede completo al soltar. Sin grupos colapsables ni tooltips — el
            long-press no es confiable en web y aquí no hay espacio para
            descripciones. Este rango no tiene rail: a 700 px de ancho la nav
            ya es horizontal. */}
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
              className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-surface to-transparent"
            />
          )}
          {!scrollState.atEnd && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-surface to-transparent"
            />
          )}
        </div>

        {/* Desktop: primarios sueltos arriba, biblioteca colapsable, Ajustes al
            pie. El toggle del rail cierra la columna. */}
        <div className="hidden md:flex md:flex-1 md:flex-col">
          {grupos.map((g) => {
            const estaColapsado = g.colapsable ? (colapsado?.[g.id] ?? g.colapsadoPorDefecto ?? false) : false
            return (
              <div key={g.id} className="mb-3">
                {g.colapsable ? (
                  <button
                    type="button"
                    onClick={() => toggleGrupo(g.id)}
                    aria-expanded={!estaColapsado}
                    aria-label={g.grupo}
                    title={esRail ? g.grupo : undefined}
                    className={`lbl flex w-full items-center border-t border-hair pb-1 pt-2 hover:text-ink ${
                      esRail ? 'justify-center px-0' : 'justify-between px-2'
                    }`}
                  >
                    {!esRail && <span>{g.grupo}</span>}
                    <Icono
                      name="chevron"
                      width={12}
                      height={12}
                      className={`transition-transform ${estaColapsado ? '-rotate-90' : ''}`}
                    />
                  </button>
                ) : (
                  g.grupo &&
                  !esRail && (
                    <p className="lbl px-2 pb-1">{g.grupo}</p>
                  )
                )}
                {!estaColapsado && (
                  <div className="flex flex-col gap-0.5">
                    {g.items.map((it) => (
                      <DesktopNavItem
                        key={it.href}
                        item={it}
                        active={isActive(it.href)}
                        subActive={isActive}
                        rail={esRail}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          <div className="mt-auto border-t border-hair pt-3">
            <p className={`text-[10px] leading-snug text-faint ${esRail ? 'px-0 text-center' : 'px-2'}`}>
              <kbd className="rounded border border-hair bg-paper px-1 py-0.5 font-sans text-[10px] text-faint">
                {teclaAtajo}K
              </kbd>
              {!esRail && ' para saltar'}
            </p>

            <button
              type="button"
              onClick={toggleRail}
              aria-expanded={!esRail}
              aria-controls="nav-lateral"
              aria-label={esRail ? 'Expandir la navegación' : 'Colapsar la navegación'}
              title={`${esRail ? 'Expandir' : 'Colapsar'} la navegación ([)`}
              className={`mt-2 flex w-full items-center rounded-md py-2 text-[11px] font-medium text-faint transition-colors hover:bg-paper hover:text-muted ${
                esRail ? 'justify-center px-0' : 'gap-2 px-2'
              }`}
            >
              <Icono name="chevron-doble" width={16} height={16} className={esRail ? 'rotate-180' : ''} />
              {!esRail && <span>Colapsar</span>}
            </button>
          </div>
        </div>
      </nav>

      {/* El padding de abajo libra la barra inferior (≈60 px) más el home
          indicator del iPhone; arriba solo hay que compensar la fila de tabs en
          el rango de tablet angosta. */}
      <div className="pb-[calc(4.25rem+env(safe-area-inset-bottom))] sm:pb-0 sm:pt-14 md:pt-0">{children}</div>

      <NavInferior grupos={grupos} />
      <CommandPalette grupos={grupos} proyectos={proyectos} />
    </div>
  )
}
