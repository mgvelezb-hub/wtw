'use client'

import { useState } from 'react'

// Un <select> que además deja crear la opción que falta.
//
// El caso que lo motiva: "Otra" en herramienta no guardaba nada — la tarea
// quedaba con la cadena literal "Otra" y la herramienta real se perdía. Y el
// selector de proyecto no ofrecía crear uno, así que capturar algo de un
// proyecto nuevo obligaba a salirse del formulario.
//
// La opción de agregar va al FINAL y separada: es la salida cuando la lista no
// alcanza, no una alternativa de primer nivel que compita con lo que ya existe.
export function SelectConAgregar({
  valor,
  onValor,
  opciones,
  etiqueta,
  vacio,
  textoAgregar,
  placeholderNuevo,
  className = '',
  disabled = false,
}: {
  valor: string
  onValor: (v: string) => void
  opciones: { valor: string; texto: string }[]
  etiqueta: string
  vacio: string
  textoAgregar: string
  placeholderNuevo: string
  className?: string
  disabled?: boolean
}) {
  const [escribiendo, setEscribiendo] = useState(false)
  const [nuevo, setNuevo] = useState('')

  function confirmar() {
    const v = nuevo.trim()
    if (v !== '') onValor(v)
    setNuevo('')
    setEscribiendo(false)
  }

  if (escribiendo) {
    return (
      <span className={`flex items-center gap-1 ${className}`}>
        <input
          autoFocus
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          // Enter confirma y Escape cancela: es un campo que aparece en medio de
          // un formulario y salir de él no debería costar un tap preciso.
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              confirmar()
            }
            if (e.key === 'Escape') {
              setNuevo('')
              setEscribiendo(false)
            }
          }}
          onBlur={confirmar}
          placeholder={placeholderNuevo}
          aria-label={placeholderNuevo}
          disabled={disabled}
          className="min-h-11 w-full min-w-0 rounded border border-brand bg-surface px-1.5 text-xs text-ink outline-none"
        />
      </span>
    )
  }

  return (
    <select
      value={valor}
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value === '@@nuevo@@') {
          setEscribiendo(true)
          return
        }
        onValor(e.target.value)
      }}
      aria-label={etiqueta}
      className={className}
    >
      <option value="">{vacio}</option>
      {/* Un valor que ya está en la tarea pero no en la lista —porque se tecleó
          y todavía no se guarda— tiene que seguir visible, o el select lo
          borraría al repintar. */}
      {valor !== '' && !opciones.some((o) => o.valor === valor) && <option value={valor}>{valor}</option>}
      {opciones.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.texto}
        </option>
      ))}
      <option disabled>──────────</option>
      <option value="@@nuevo@@">{textoAgregar}</option>
    </select>
  )
}
