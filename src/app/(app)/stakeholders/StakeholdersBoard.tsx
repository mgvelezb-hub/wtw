'use client'

import { useState, useTransition } from 'react'
import type { InteraccionTipo, StakeholderPostura, VariableConfianza } from '@prisma/client'
import type { EtiquetaSalud, MapaStakeholders, StakeholderView, TierSaliencia } from './service'
import {
  ETIQUETA_SALUD_LABEL,
  TIER_LABEL,
  TIER_NOTA,
  VARIABLES_CONFIANZA,
  VARIABLE_CONFIANZA_LABEL,
} from './service'
import type { CompetenciaPlaneacion } from '@/app/(app)/desarrollo/service'
import {
  crearStakeholderAction,
  actualizarStakeholderAction,
  registrarInteraccionAction,
  borrarStakeholderAction,
} from './actions'

const TIPOS: InteraccionTipo[] = ['junta', 'llamada', 'correo', 'informal', 'presentacion']
const POSTURAS: StakeholderPostura[] = ['aliado', 'neutral', 'opositor', 'desconocida']

const POSTURA_COLOR: Record<string, string> = {
  aliado: 'bg-brand-strong text-white',
  neutral: 'bg-hair text-muted',
  opositor: 'bg-danger text-white',
  desconocida: 'bg-warn-soft text-warn',
}

const ESCALA = [
  { valor: 1, label: 'bajo' },
  { valor: 2, label: 'medio' },
  { valor: 3, label: 'alto' },
]

// La etiqueta de salud es la única señal semántica de la ficha: verde solo si la
// relación está al día Y sin incumplimientos pendientes; rojo cuando hay algo roto
// o la cadencia ya se pasó al doble.
const SALUD_COLOR: Record<EtiquetaSalud, string> = {
  sana: 'bg-ok-soft text-ok',
  enfriandose: 'bg-warn-soft text-warn',
  fria: 'bg-danger-soft text-danger',
  en_riesgo: 'bg-danger text-white',
}

// El tier NO es semáforo — es una clasificación. Pintarlo de rojo diría que ser
// definitivo es malo, cuando es solo el que más atención exige.
const TIER_COLOR: Record<TierSaliencia, string> = {
  definitivo: 'bg-brand-deep text-white',
  expectante: 'bg-brand-deep/15 text-brand-deep',
  latente: 'bg-hair text-muted',
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function StakeholdersBoard({
  mapa,
  proyectos,
  competencias,
}: {
  mapa: MapaStakeholders
  proyectos: Array<{ id: string; nombre: string }>
  competencias: CompetenciaPlaneacion[]
}): React.ReactElement {
  const [error, setError] = useState<string | null>(null)
  const [nuevoAbierto, setNuevoAbierto] = useState(false)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function accion(fn: () => Promise<void>): void {
    setError(null)
    startTransition(async () => {
      try {
        await fn()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo guardar.')
      }
    })
  }

  const vencidos = mapa.stakeholders.filter((s) => s.cadenciaVencida)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Stakeholders</h1>
        <p className="text-sm text-muted">
          <span className="num">{mapa.resumen.total}</span> mapeados ·{' '}
          <strong className="num text-danger">{mapa.resumen.vencidos}</strong> con cadencia vencida
          {mapa.resumen.poderAltoVencidos > 0 && (
            <>
              {' '}
              · <span className="num">{mapa.resumen.poderAltoVencidos}</span> de ellos con poder alto
            </>
          )}
          {mapa.resumen.sinCadencia > 0 && (
            <>
              {' '}
              · <span className="num">{mapa.resumen.sinCadencia}</span> sin cadencia comprometida
            </>
          )}
        </p>
        {(mapa.resumen.frias > 0 || mapa.resumen.enRiesgo > 0) && (
          <p className="mt-1 text-sm text-muted">
            {mapa.resumen.frias > 0 && (
              <span className="mr-2 rounded bg-danger-soft px-1.5 py-0.5 text-xs font-bold text-danger">
                <span className="num">{mapa.resumen.frias}</span> {mapa.resumen.frias === 1 ? 'fría' : 'frías'}
              </span>
            )}
            {mapa.resumen.enRiesgo > 0 && (
              <span className="rounded bg-danger px-1.5 py-0.5 text-xs font-bold text-white">
                <span className="num">{mapa.resumen.enRiesgo}</span> en riesgo
              </span>
            )}
          </p>
        )}
        <p className="mt-1 text-xs text-faint">
          Proximidad con stakeholders es una de las tres expectativas de Gerente. Registrar el contacto real aquí es lo que
          la vuelve evidencia y no percepción. La cadencia dice si le hablaste; la salud dice cómo va la relación — se
          puede estar al día en contactos y en riesgo por un compromiso roto.
        </p>
      </header>

      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      {vencidos.length > 0 && (
        <section className="rounded-md border-2 border-danger bg-surface p-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-danger">Por contactar</h2>
          <p className="mt-1 text-xs text-muted">
            Ordenados por retraso contra su propia cadencia, no por antigüedad: 20 días sobre una cadencia de 7 pesa más
            que 2 sobre una de 30.
          </p>
          <ul className="mt-2 space-y-1">
            {vencidos.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <strong className="text-ink">{s.nombre}</strong>
                {s.puesto && <span className="text-xs text-muted">{s.puesto}</span>}
                <span className="num rounded bg-danger-soft px-1.5 text-xs font-bold text-danger">
                  {s.diasSinContacto === null ? 'nunca contactado' : `${s.diasDeRetraso}d de retraso`}
                </span>
                {s.proyecto && <span className="text-xs text-faint">· {s.proyecto}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="hair pt-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="lbl">Matriz de poder e interés</h2>
          <button
            onClick={() => setNuevoAbierto((v) => !v)}
            className="rounded-md border border-hair bg-surface px-3 py-1 text-xs font-bold text-brand-deep hover:bg-brand-soft"
          >
            {nuevoAbierto ? 'Cancelar' : '+ Stakeholder'}
          </button>
        </div>

        {nuevoAbierto && (
          <FormaNuevo
            proyectos={proyectos}
            pending={pending}
            onCrear={(input) =>
              accion(async () => {
                await crearStakeholderAction(input)
                setNuevoAbierto(false)
              })
            }
          />
        )}

        {mapa.resumen.total === 0 ? (
          <p className="mt-3 text-sm text-faint">
            Nadie mapeado todavía. Los stakeholders del engagement viven hoy como texto libre dentro de títulos de tareas:
            aquí es donde se vuelven dato.
          </p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {mapa.porCuadrante.map((c) => (
              <div
                key={c.cuadrante}
                className={`rounded-md border p-3 ${
                  c.cuadrante === 'gestionar_de_cerca' || c.cuadrante === 'mantener_satisfecho'
                    ? 'border-brand-deep/40 bg-brand-deep/5'
                    : 'border-hair bg-paper'
                }`}
              >
                <h3 className="lbl">
                  {c.label} <span className="num text-faint">({c.stakeholders.length})</span>
                </h3>
                <p className="mt-0.5 text-[11px] leading-tight text-muted">{c.nota}</p>
                <ul className="mt-2 space-y-0.5">
                  {c.stakeholders.map((s) => (
                    <li key={s.id} className="truncate text-xs text-ink">
                      {s.cadenciaVencida && <span className="text-danger">● </span>}
                      {s.nombre}
                    </li>
                  ))}
                  {c.stakeholders.length === 0 && <li className="text-xs text-faint">—</li>}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {mapa.stakeholders.length > 0 && (
        <section>
          <h2 className="lbl">Fichas</h2>
          <div className="divide-y divide-hair">
            {mapa.stakeholders.map((s) => (
              <Ficha
                key={s.id}
                s={s}
                proyectos={proyectos}
                competencias={competencias}
                abierto={expandido === s.id}
                pending={pending}
                onToggle={() => setExpandido((v) => (v === s.id ? null : s.id))}
                onAccion={accion}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function FormaNuevo({
  proyectos,
  pending,
  onCrear,
}: {
  proyectos: Array<{ id: string; nombre: string }>
  pending: boolean
  onCrear: (input: {
    nombre: string
    puesto?: string
    projectId?: string
    poder: number
    interes: number
    postura: StakeholderPostura
    queNecesita?: string
    cadenciaDias?: number | null
  }) => void
}): React.ReactElement {
  const [nombre, setNombre] = useState('')
  const [puesto, setPuesto] = useState('')
  const [projectId, setProjectId] = useState('')
  const [poder, setPoder] = useState(2)
  const [interes, setInteres] = useState(2)
  const [postura, setPostura] = useState<StakeholderPostura>('desconocida')
  const [queNecesita, setQueNecesita] = useState('')
  const [cadencia, setCadencia] = useState('')

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-brand-deep/30 bg-brand-deep/5 p-3">
      <div className="flex flex-wrap gap-1">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre"
          aria-label="Nombre del stakeholder"
          className="min-w-40 flex-1 rounded border border-hair bg-surface px-2 py-1 text-sm text-ink"
        />
        <input
          value={puesto}
          onChange={(e) => setPuesto(e.target.value)}
          placeholder="Puesto"
          aria-label="Puesto"
          className="min-w-32 flex-1 rounded border border-hair bg-surface px-2 py-1 text-sm text-ink"
        />
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          aria-label="Proyecto"
          className="rounded border border-hair bg-surface px-1 py-1 text-xs text-muted"
        >
          <option value="">Sin proyecto</option>
          {proyectos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <label className="flex items-center gap-1">
          Poder
          <select
            value={poder}
            onChange={(e) => setPoder(Number(e.target.value))}
            aria-label="Poder"
            className="rounded border border-hair bg-surface px-1 py-0.5"
          >
            {ESCALA.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          Interés
          <select
            value={interes}
            onChange={(e) => setInteres(Number(e.target.value))}
            aria-label="Interés"
            className="rounded border border-hair bg-surface px-1 py-0.5"
          >
            {ESCALA.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          Postura
          <select
            value={postura}
            onChange={(e) => setPostura(e.target.value as StakeholderPostura)}
            aria-label="Postura"
            className="rounded border border-hair bg-surface px-1 py-0.5"
          >
            {POSTURAS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          Contactar cada
          <input
            type="number"
            min={1}
            value={cadencia}
            onChange={(e) => setCadencia(e.target.value)}
            placeholder="—"
            aria-label="Cadencia en días"
            className="num w-14 rounded border border-hair bg-surface px-1 py-0.5 text-ink"
          />
          días
        </label>
      </div>

      <input
        value={queNecesita}
        onChange={(e) => setQueNecesita(e.target.value)}
        placeholder="Qué necesita ESTA persona para considerar el proyecto un éxito"
        aria-label="Qué necesita"
        className="w-full rounded border border-hair bg-surface px-2 py-1 text-sm text-ink"
      />

      <button
        disabled={pending || nombre.trim() === ''}
        onClick={() =>
          onCrear({
            nombre,
            puesto: puesto || undefined,
            projectId: projectId || undefined,
            poder,
            interes,
            postura,
            queNecesita: queNecesita || undefined,
            cadenciaDias: cadencia ? Number(cadencia) : null,
          })
        }
        className="rounded-md bg-brand px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40"
      >
        {pending ? 'Guardando…' : 'Agregar'}
      </button>
    </div>
  )
}

function Ficha({
  s,
  proyectos,
  competencias,
  abierto,
  pending,
  onToggle,
  onAccion,
}: {
  s: StakeholderView
  proyectos: Array<{ id: string; nombre: string }>
  competencias: CompetenciaPlaneacion[]
  abierto: boolean
  pending: boolean
  onToggle: () => void
  onAccion: (fn: () => Promise<void>) => void
}): React.ReactElement {
  const [fecha, setFecha] = useState(hoyISO())
  const [tipo, setTipo] = useState<InteraccionTipo>('junta')
  const [nota, setNota] = useState('')
  const [competencyId, setCompetencyId] = useState('')
  const [variable, setVariable] = useState<VariableConfianza | ''>('')
  const [incumplimiento, setIncumplimiento] = useState(false)
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)

  return (
    <article className="py-3">
      <button onClick={onToggle} className="flex w-full flex-wrap items-baseline gap-x-2 text-left">
        <strong className="text-sm text-ink">{s.nombre}</strong>
        {s.puesto && <span className="text-xs text-muted">{s.puesto}</span>}
        <span className={`rounded px-1.5 text-[10px] font-bold uppercase ${POSTURA_COLOR[s.postura]}`}>{s.postura}</span>
        <span
          className={`num rounded px-1.5 text-[10px] font-bold uppercase ${TIER_COLOR[s.salud.tier]}`}
          title={TIER_NOTA[s.salud.tier]}
        >
          {TIER_LABEL[s.salud.tier]} {s.salud.atributos}/3
        </span>
        <span className={`num rounded px-1.5 text-[10px] font-bold uppercase ${SALUD_COLOR[s.salud.etiqueta]}`}>
          {s.salud.score} · {ETIQUETA_SALUD_LABEL[s.salud.etiqueta]}
        </span>
        <span className="text-xs text-faint">
          poder {ESCALA[s.poder - 1]?.label} · interés {ESCALA[s.interes - 1]?.label}
        </span>
        <span className="ml-auto text-xs text-muted">
          {s.diasSinContacto === null ? (
            <span className="text-danger">sin contacto registrado</span>
          ) : (
            <>
              <span className="num">hace {s.diasSinContacto}d</span>
              <span className="num text-faint">
                {' '}
                / cada {s.salud.cadenciaEsperada}d{s.cadenciaDias === null && ' (por tier)'}
              </span>
            </>
          )}
          <span className="ml-1 text-faint">{abierto ? '▲' : '▼'}</span>
        </span>
      </button>

      {s.queNecesita && (
        <p className="mt-1 text-xs text-muted">
          <span className="text-faint">Necesita:</span> {s.queNecesita}
        </p>
      )}

      {/* La acción concreta, no el diagnóstico: un marcador que solo dice "fría" es
          otra métrica más que mirar. */}
      <p className="mt-1 text-xs text-muted">
        <span className="text-faint">Siguiente:</span> {s.salud.siguienteAccion}
      </p>

      {abierto && (
        <div className="mt-3 space-y-3 border-t border-hair pt-3">
          <div className="space-y-2 rounded-lg border border-hair bg-surface p-2">
            <p className="text-xs font-bold text-brand-deep">Registrar contacto</p>
            <div className="flex flex-wrap gap-1">
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                aria-label={`Fecha de contacto con ${s.nombre}`}
                className="num rounded border border-hair bg-surface px-1 py-0.5 text-xs text-ink"
              />
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as InteraccionTipo)}
                aria-label={`Tipo de contacto con ${s.nombre}`}
                className="rounded border border-hair bg-surface px-1 py-0.5 text-xs text-muted"
              >
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Qué se habló"
                aria-label={`Nota del contacto con ${s.nombre}`}
                className="min-w-40 flex-1 rounded border border-hair bg-surface px-2 py-0.5 text-xs text-ink"
              />
            </div>
            {/* Qué movió el contacto, en las cuatro variables de Maister. El default
                es "solo contacto": no todo lo que se registra construye confianza, y
                marcar todo como si construyera vacía el marcador. */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={variable}
                onChange={(e) => setVariable(e.target.value as VariableConfianza | '')}
                aria-label={`Variable de confianza del contacto con ${s.nombre}`}
                className={`flex-1 rounded border px-1 py-0.5 text-xs ${
                  variable ? 'border-brand-strong/40 bg-brand-strong/5 text-brand-deep' : 'border-hair bg-surface text-muted'
                }`}
              >
                <option value="">Solo contacto — no construyó confianza</option>
                {VARIABLES_CONFIANZA.map((v) => (
                  <option key={v} value={v}>
                    {VARIABLE_CONFIANZA_LABEL[v]}
                  </option>
                ))}
              </select>

              {/* Discreto a propósito: registrar un incumplimiento cuesta 3x en el
                  marcador, así que tiene que ser deliberado y nunca un clic de paso. */}
              <button
                type="button"
                aria-pressed={incumplimiento}
                onClick={() => setIncumplimiento((v) => !v)}
                className={`rounded-md border px-2 py-0.5 text-xs ${
                  incumplimiento
                    ? 'border-danger bg-danger font-bold text-white'
                    : 'border-hair bg-surface text-muted hover:border-danger/50 hover:text-danger'
                }`}
              >
                {incumplimiento ? '✓ fue un incumplimiento' : 'fue un incumplimiento'}
              </button>
            </div>

            {competencias.length > 0 && (
              <select
                value={competencyId}
                onChange={(e) => setCompetencyId(e.target.value)}
                aria-label={`Competencia que acredita el contacto con ${s.nombre}`}
                className={`w-full rounded border px-1 py-0.5 text-xs ${
                  competencyId ? 'border-brand-strong/40 bg-brand-strong/5 text-brand-deep' : 'border-hair bg-surface text-muted'
                }`}
              >
                <option value="">No cuenta como evidencia</option>
                {competencias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.vacia ? '○ ' : '● '}
                    {c.grupo} · {c.etiqueta}
                  </option>
                ))}
              </select>
            )}
            <button
              disabled={pending}
              onClick={() =>
                onAccion(async () => {
                  await registrarInteraccionAction({
                    stakeholderId: s.id,
                    fecha,
                    tipo,
                    nota: nota || undefined,
                    competencyId: competencyId || undefined,
                    variableConfianza: variable || null,
                    esIncumplimiento: incumplimiento,
                  })
                  setNota('')
                  setCompetencyId('')
                  setVariable('')
                  setIncumplimiento(false)
                })
              }
              className="rounded-md bg-brand px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
            >
              {pending ? 'Guardando…' : 'Registrar'}
            </button>
          </div>

          {s.interacciones.length > 0 && (
            <ul className="space-y-0.5">
              {s.interacciones.map((i) => (
                <li key={i.id} className="text-xs text-muted">
                  <span className="num text-faint">{i.fecha}</span> · {i.tipo}
                  {i.variableConfianza && (
                    <span className="ml-1 rounded bg-brand-strong/10 px-1 text-[10px] text-brand-deep">
                      {VARIABLE_CONFIANZA_LABEL[i.variableConfianza]}
                    </span>
                  )}
                  {i.esIncumplimiento && (
                    <span className="ml-1 rounded bg-danger-soft px-1 text-[10px] font-bold text-danger">
                      incumplimiento
                    </span>
                  )}
                  {i.nota && <> — {i.nota}</>}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <label className="flex items-center gap-1">
              Poder
              <select
                value={s.poder}
                disabled={pending}
                onChange={(e) => onAccion(() => actualizarStakeholderAction(s.id, { poder: Number(e.target.value) }))}
                aria-label={`Poder de ${s.nombre}`}
                className="rounded border border-hair bg-surface px-1 py-0.5"
              >
                {ESCALA.map((e) => (
                  <option key={e.valor} value={e.valor}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              Interés
              <select
                value={s.interes}
                disabled={pending}
                onChange={(e) => onAccion(() => actualizarStakeholderAction(s.id, { interes: Number(e.target.value) }))}
                aria-label={`Interés de ${s.nombre}`}
                className="rounded border border-hair bg-surface px-1 py-0.5"
              >
                {ESCALA.map((e) => (
                  <option key={e.valor} value={e.valor}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>
            {/* Los otros dos atributos de saliencia. Cambiarlos mueve el tier y con
                él la cadencia esperada, así que viven junto a poder e interés y no
                escondidos en otra pantalla. */}
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={s.legitimidad}
                disabled={pending}
                onChange={(e) => onAccion(() => actualizarStakeholderAction(s.id, { legitimidad: e.target.checked }))}
                aria-label={`Legitimidad de ${s.nombre}`}
                className="accent-brand-deep"
              />
              Legitimidad
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={s.urgencia}
                disabled={pending}
                onChange={(e) => onAccion(() => actualizarStakeholderAction(s.id, { urgencia: e.target.checked }))}
                aria-label={`Urgencia de ${s.nombre}`}
                className="accent-brand-deep"
              />
              Urgencia
            </label>
            <label className="flex items-center gap-1">
              Postura
              <select
                value={s.postura}
                disabled={pending}
                onChange={(e) =>
                  onAccion(() => actualizarStakeholderAction(s.id, { postura: e.target.value as StakeholderPostura }))
                }
                aria-label={`Postura de ${s.nombre}`}
                className="rounded border border-hair bg-surface px-1 py-0.5"
              >
                {POSTURAS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              Cada
              <input
                type="number"
                min={1}
                defaultValue={s.cadenciaDias ?? ''}
                // Vacío no es "sin cadencia": es la cadencia que dicta el tier. El
                // placeholder la muestra para que no parezca que no hay ninguna.
                placeholder={String(s.salud.cadenciaEsperada)}
                disabled={pending}
                onBlur={(e) =>
                  onAccion(() =>
                    actualizarStakeholderAction(s.id, { cadenciaDias: e.target.value ? Number(e.target.value) : null })
                  )
                }
                aria-label={`Cadencia de ${s.nombre}`}
                className="num w-14 rounded border border-hair bg-surface px-1 py-0.5 text-ink"
              />
              días
            </label>
            <label className="flex items-center gap-1">
              Proyecto
              <select
                value={s.projectId ?? ''}
                disabled={pending}
                onChange={(e) => onAccion(() => actualizarStakeholderAction(s.id, { projectId: e.target.value || null }))}
                aria-label={`Proyecto de ${s.nombre}`}
                className="rounded border border-hair bg-surface px-1 py-0.5"
              >
                <option value="">Sin proyecto</option>
                {proyectos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>

            {/* Confirmación en línea, no `confirm()`: los diálogos nativos ya se
                suprimieron del resto de la app. */}
            {confirmarBorrado ? (
              <span className="ml-auto flex items-center gap-1">
                <button
                  disabled={pending}
                  onClick={() => onAccion(() => borrarStakeholderAction(s.id))}
                  className="rounded-md bg-danger px-2 py-0.5 font-bold text-white disabled:opacity-40"
                >
                  Borrar de verdad
                </button>
                <button onClick={() => setConfirmarBorrado(false)} className="text-muted underline">
                  no
                </button>
              </span>
            ) : (
              <button onClick={() => setConfirmarBorrado(true)} className="ml-auto text-faint underline">
                borrar
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  )
}
