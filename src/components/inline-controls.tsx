'use client'

import { useEffect, useRef, useState } from 'react'

// Confirmación en dos clics, sin `window.confirm`. El diálogo nativo es una
// trampa: si el navegador muestra "impedir que esta página cree diálogos
// adicionales" y el usuario lo marca, `confirm()` empieza a devolver `false` de
// inmediato y sin aviso — el botón queda muerto hasta recargar, sin señal de
// que algo se rompió. Aquí el primer clic arma el botón ("¿Quitar?") y el
// segundo ejecuta; se desarma solo a los 4 s o al salir el cursor.
export function ConfirmarQuitar({
  onConfirm,
  disabled,
  titulo,
  className,
  armedClassName,
  icono = '✕',
  textoArmado = '¿Quitar?',
}: {
  onConfirm: () => void
  disabled: boolean
  titulo: string
  className: string
  armedClassName: string
  icono?: string
  textoArmado?: string
}) {
  const [armed, setArmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function disarm() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setArmed(false)
  }

  useEffect(() => disarm, [])

  return (
    <button
      disabled={disabled}
      onClick={() => {
        if (!armed) {
          setArmed(true)
          timer.current = setTimeout(() => setArmed(false), 4000)
          return
        }
        disarm()
        onConfirm()
      }}
      onMouseLeave={() => armed && disarm()}
      onBlur={() => armed && disarm()}
      className={armed ? armedClassName : className}
      title={armed ? 'Clic otra vez para confirmar' : titulo}
      aria-label={armed ? `Confirmar: ${textoArmado}` : titulo}
    >
      {armed ? textoArmado : icono}
    </button>
  )
}

// Input en línea para sustituir `window.prompt`, que carga la misma trampa que
// `confirm`: si el navegador silencia los diálogos de la página, `prompt()`
// devuelve `null` sin abrir nada y el botón queda muerto hasta recargar.
// Primer clic abre el input en el lugar del botón; Enter o ✓ guardan, Esc o ✕
// cancelan. Sin blur-cancela: pelearse con el clic en ✓ es una fuente clásica de
// "guardé y no pasó nada".
export function CampoEnLinea({
  icono,
  titulo,
  valorInicial,
  placeholder,
  ancho,
  parse,
  onSubmit,
  disabled,
  className,
}: {
  icono: string
  titulo: string
  valorInicial?: string
  placeholder?: string
  ancho: string
  parse: (raw: string) => string | number | null
  onSubmit: (valor: string | number) => void
  disabled: boolean
  className: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [raw, setRaw] = useState('')
  const parsed = parse(raw)
  const valido = parsed !== null

  function abrir() {
    setRaw(valorInicial ?? '')
    setAbierto(true)
  }

  function guardar() {
    if (parsed === null) return
    setAbierto(false)
    onSubmit(parsed)
  }

  if (!abierto) {
    return (
      <button disabled={disabled} onClick={abrir} className={className} title={titulo} aria-label={titulo}>
        {icono}
      </button>
    )
  }

  return (
    <span
      draggable={false}
      onDragStart={(e) => e.stopPropagation()}
      className="ml-1 inline-flex items-center gap-1 align-middle"
    >
      <input
        autoFocus
        value={raw}
        placeholder={placeholder}
        aria-label={titulo}
        disabled={disabled}
        onChange={(e) => setRaw(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            guardar()
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            setAbierto(false)
          }
        }}
        className={`${ancho} rounded border px-1 py-0.5 text-xs text-ink ${
          valido ? 'border-hair' : 'border-danger'
        }`}
      />
      <button
        disabled={disabled || !valido}
        onClick={guardar}
        className="text-xs font-bold text-brand-deep disabled:text-faint"
        title="Guardar"
        aria-label="Guardar"
      >
        ✓
      </button>
      <button
        disabled={disabled}
        onClick={() => setAbierto(false)}
        className="text-xs font-bold text-faint hover:text-danger"
        title="Cancelar"
        aria-label="Cancelar"
      >
        ✕
      </button>
    </span>
  )
}
