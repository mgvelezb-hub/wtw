'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Icono, type Grupo, type IconName, type ProyectoNav } from './nav-iconos'

// Salto directo a cualquier ruta o proyecto con ⌘K / Ctrl+K. Es la respuesta de
// escritorio al mismo problema que la barra inferior resuelve en el teléfono:
// con 12+ destinos, el sidebar deja de ser navegación y se vuelve una lista que
// hay que leer. Aquí se escribe el destino y se llega en dos teclas.
//
// El listener es global y siempre está montado: en táctil simplemente nunca se
// dispara (no hay ⌘ ni Ctrl), así que no hace falta detectar el dispositivo, y
// un iPad con teclado —el equipo principal de esta app— lo gana gratis.

type Resultado = {
  href: string
  label: string
  desc: string
  contexto: string
  icon?: IconName
  color?: string
}

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function rutasDe(grupos: Grupo[]): Resultado[] {
  const rutas: Resultado[] = []

  for (const g of grupos) {
    for (const it of g.items) {
      rutas.push({ href: it.href, label: it.label, desc: it.desc, contexto: g.contexto, icon: it.icon })
      for (const s of it.sub ?? []) {
        // Los sub-links de proyecto se omiten aquí: entran abajo con su color y
        // su propio contexto, y duplicarlos volvería ruidosa la lista.
        if (s.href.startsWith('/proyectos/')) continue
        rutas.push({ href: s.href, label: s.label, desc: it.desc, contexto: it.label, icon: it.icon })
      }
    }
  }

  return rutas
}

// El orden sin query es el de la nav —los 5 momentos primarios, luego la
// biblioteca—, después los proyectos activos y al final Ajustes. Sin escribir
// nada, el primer Enter cae en "Hoy".
function construirResultados(grupos: Grupo[], proyectos: ProyectoNav[]): Resultado[] {
  const proyectosRes: Resultado[] = proyectos.map((p) => ({
    href: `/proyectos/${p.id}`,
    label: p.nombre,
    desc: 'Entregables, pendientes y minutas del engagement',
    contexto: 'Proyecto',
    color: p.color,
  }))

  return [
    ...rutasDe(grupos.filter((g) => !g.alFinal)),
    ...proyectosRes,
    ...rutasDe(grupos.filter((g) => g.alFinal)),
  ]
}

function filtrar(todos: Resultado[], query: string): Resultado[] {
  const q = normalizar(query.trim())
  if (!q) return todos
  const terminos = q.split(/\s+/)
  return todos.filter((r) => {
    const heno = normalizar(`${r.label} ${r.desc} ${r.contexto} ${r.href}`)
    return terminos.every((t) => heno.includes(t))
  })
}

export function CommandPalette({ grupos, proyectos }: { grupos: Grupo[]; proyectos: ProyectoNav[] }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)

  const input = useRef<HTMLInputElement | null>(null)
  const panel = useRef<HTMLDivElement | null>(null)
  const lista = useRef<HTMLUListElement | null>(null)
  // Quién tenía el foco antes de abrir, para devolvérselo al cerrar.
  const foco = useRef<HTMLElement | null>(null)

  const todos = useMemo(() => construirResultados(grupos, proyectos), [grupos, proyectos])
  const resultados = useMemo(() => filtrar(todos, query), [todos, query])

  const cerrar = useCallback(function cerrar(): void {
    setAbierto(false)
    setQuery('')
    setSel(0)
    foco.current?.focus()
    foco.current = null
  }, [])

  // ⌘K / Ctrl+K abre y cierra. `preventDefault` porque Chrome y Firefox le dan
  // ⌘K a la barra de direcciones.
  useEffect(() => {
    function alTeclear(e: KeyboardEvent): void {
      if (e.key.toLowerCase() !== 'k' || !(e.metaKey || e.ctrlKey)) return
      e.preventDefault()
      setAbierto((v) => {
        if (v) return false
        foco.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        return true
      })
    }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [])

  useEffect(() => {
    if (abierto) input.current?.focus()
  }, [abierto])

  // Mantener el seleccionado a la vista cuando se navega con ↑↓ más allá de los
  // ~8 resultados visibles.
  useEffect(() => {
    if (!abierto) return
    const el = lista.current?.querySelector<HTMLElement>(`[data-idx="${sel}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [sel, abierto])

  function navegar(href: string): void {
    cerrar()
    router.push(href)
  }

  function alTeclearPanel(e: ReactKeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      cerrar()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((i) => (resultados.length === 0 ? 0 : (i + 1) % resultados.length))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((i) => (resultados.length === 0 ? 0 : (i - 1 + resultados.length) % resultados.length))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const r = resultados[sel]
      if (r) navegar(r.href)
      return
    }
    if (e.key === 'Tab') {
      // Trampa de foco básica: el Tab cicla dentro del panel en vez de irse a la
      // página de atrás, que sigue ahí y es larga.
      const focusables = panel.current?.querySelectorAll<HTMLElement>('input, button, [href]')
      if (!focusables || focusables.length === 0) return
      const primero = focusables[0]
      const ultimo = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault()
        primero.focus()
      }
    }
  }

  if (!abierto) return null

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/25" onMouseDown={cerrar}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Ir a"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={alTeclearPanel}
        className="mx-auto mt-24 w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg"
      >
        <div className="flex items-center gap-2 border-b border-neutral-100 px-3">
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSel(0)
            }}
            role="combobox"
            aria-expanded
            aria-controls="cmdk-lista"
            aria-activedescendant={resultados[sel] ? `cmdk-op-${sel}` : undefined}
            aria-label="Buscar una sección o un proyecto"
            placeholder="Ir a… (sección o proyecto)"
            className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-neutral-400"
          />
          <button
            type="button"
            onClick={cerrar}
            className="shrink-0 rounded border border-neutral-200 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400 hover:bg-neutral-100"
          >
            Esc
          </button>
        </div>

        {resultados.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-neutral-400">Nada coincide con «{query}»</p>
        ) : (
          // ~8 filas visibles (44 px cada una) y el resto con scroll.
          <ul ref={lista} id="cmdk-lista" role="listbox" aria-label="Resultados" className="max-h-[22rem] overflow-y-auto py-1">
            {resultados.map((r, i) => (
              <li key={`${r.href}-${i}`}>
                <button
                  type="button"
                  data-idx={i}
                  id={`cmdk-op-${i}`}
                  role="option"
                  aria-selected={i === sel}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => navegar(r.href)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                    i === sel ? 'bg-brand-soft' : ''
                  }`}
                >
                  <span className={i === sel ? 'shrink-0 text-brand-deep' : 'shrink-0 text-neutral-400'}>
                    {r.icon ? (
                      <Icono name={r.icon} width={18} height={18} />
                    ) : (
                      <span
                        aria-hidden
                        className="block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: r.color ?? '#a3a3a3' }}
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-neutral-800">{r.label}</span>
                    <span className="block truncate text-[11px] text-neutral-400">{r.desc}</span>
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-neutral-300">{r.contexto}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between border-t border-neutral-100 px-3 py-1.5 text-[10px] text-neutral-400">
          <span>↑↓ para moverte · Enter para ir</span>
          <span>{resultados.length} destinos</span>
        </div>
      </div>
    </div>
  )
}
