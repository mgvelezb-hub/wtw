'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Icono, type Grupo, type NavItem } from './nav-iconos'

// Los 4 destinos de operación diaria que viven en la barra inferior del iPhone.
// El orden es el del horizonte: hoy → la semana → el cierre → la bandeja.
// "Actividades" se queda pese a no ser un momento primario porque la captura
// rápida ES el uso principal del teléfono. Todo lo demás entra por "Más": una
// barra de teléfono con 12 destinos no es navegación, es una lista disfrazada.
const DESTINOS = ['/dia', '/semana', '/cierre', '/inbox']

function itemsPrincipales(grupos: Grupo[]): NavItem[] {
  const porHref = new Map(grupos.flatMap((g) => g.items).map((it) => [it.href, it]))
  // `filter(Boolean)` no estrecha el tipo en TS; el flatMap sí.
  return DESTINOS.flatMap((href) => {
    const it = porHref.get(href)
    return it ? [it] : []
  })
}

export function NavInferior({ grupos }: { grupos: Grupo[] }) {
  const pathname = usePathname()
  const isActive = (href: string): boolean => pathname === href || pathname.startsWith(href + '/')

  const principales = itemsPrincipales(grupos)

  // El panel no repite lo que ya está en la barra: quien lo abre viene a buscar
  // Proyectos, Carrera o algo de la biblioteca, no el botón que acaba de ver.
  const gruposDelPanel = grupos
    .map((g) => ({ ...g, items: g.items.filter((it) => !DESTINOS.includes(it.href)) }))
    .filter((g) => g.items.length > 0)

  // El panel guarda la ruta en la que se abrió, no un booleano: así navegar lo
  // cierra solo —el <Link> cambia la ruta sin desmontar el shell, y nadie más
  // lo cerraría— sin un `setState` dentro de un `useEffect` que dispare un
  // render en cascada por cada cambio de página.
  const [abiertoEn, setAbiertoEn] = useState<string | null>(null)
  const abierto = abiertoEn === pathname
  const botonMas = useRef<HTMLButtonElement | null>(null)

  function setAbierto(v: boolean): void {
    setAbiertoEn(v ? pathname : null)
  }

  useEffect(() => {
    if (!abierto) return
    function alTeclear(e: KeyboardEvent): void {
      if (e.key !== 'Escape') return
      setAbiertoEn(null)
      botonMas.current?.focus()
    }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [abierto])

  // Activo "de más": cualquier ruta que no sea de los 4 destinos vive detrás de
  // "Más", y la barra debe decirlo o el usuario pierde de vista dónde está.
  const enOtraRuta = !principales.some((it) => isActive(it.href))

  return (
    <>
      {abierto && (
        <>
          <button
            type="button"
            aria-label="Cerrar el panel de secciones"
            onClick={() => setAbierto(false)}
            className="fixed inset-0 z-30 bg-neutral-900/30 sm:hidden"
          />
          {/* Panel inline, no `<dialog>` nativo: el diálogo del navegador trae
              su propio backdrop y su propio manejo de foco, incompatibles con
              una barra fija que debe seguir visible debajo. */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Todas las secciones"
            className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-neutral-200 bg-white pb-4 shadow-lg sm:hidden"
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-neutral-100 bg-white px-4 py-3">
              <p className="text-sm font-bold text-brand-deep">Todas las secciones</p>
              <button
                type="button"
                onClick={() => {
                  setAbierto(false)
                  botonMas.current?.focus()
                }}
                className="rounded-md px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100"
              >
                Cerrar
              </button>
            </div>

            {gruposDelPanel.map((g) => (
              <div key={g.id} className="px-3 pt-3">
                {g.grupo && (
                  <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                    {g.grupo}
                  </p>
                )}
                <div className="flex flex-col">
                  {g.items.map((it) => (
                    <Link
                      key={it.href}
                      href={it.href}
                      aria-label={`${it.label}: ${it.desc}`}
                      aria-current={isActive(it.href) ? 'page' : undefined}
                      className={`flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors ${
                        isActive(it.href) ? 'bg-brand-soft' : 'active:bg-neutral-100'
                      }`}
                    >
                      <span className={isActive(it.href) ? 'mt-0.5 text-brand-deep' : 'mt-0.5 text-neutral-400'}>
                        <Icono name={it.icon} />
                      </span>
                      <span className="min-w-0">
                        <span
                          className={`block text-sm font-medium ${
                            isActive(it.href) ? 'text-brand-deep' : 'text-neutral-700'
                          }`}
                        >
                          {it.label}
                        </span>
                        <span className="block text-[11px] leading-snug text-neutral-400">{it.desc}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* `pb-[env(safe-area-inset-bottom)]` es lo que separa los iconos de la
          barra de gestos del iPhone cuando la PWA corre en pantalla completa;
          sin eso el home indicator queda encima de los dos tabs de en medio. */}
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        <div className="flex items-stretch">
          {principales.map((it) => {
            const activo = isActive(it.href)
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-label={`${it.label}: ${it.desc}`}
                aria-current={activo ? 'page' : undefined}
                className={`flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors ${
                  activo ? 'text-brand' : 'text-neutral-500'
                }`}
              >
                <Icono name={it.icon} width={22} height={22} />
                <span className="truncate">{it.label}</span>
              </Link>
            )
          })}

          <button
            ref={botonMas}
            type="button"
            onClick={() => setAbierto(!abierto)}
            aria-expanded={abierto}
            aria-label="Más secciones"
            className={`flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors ${
              abierto || enOtraRuta ? 'text-brand' : 'text-neutral-500'
            }`}
          >
            <Icono name="mas" width={22} height={22} />
            <span>Más</span>
          </button>
        </div>
      </nav>
    </>
  )
}
