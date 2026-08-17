import { describe, it, expect } from 'vitest'
import { medidaDe, minutosDeTexto, tituloDeDefensa, refDeMedida } from '@/app/(app)/semana/nueva/medidas'

// Las defensas del pre-mortem se van a convertir en actividades de la semana. Lo
// que se prueba aquí es que un draft viejo (sin `medida` estructurada) o una
// respuesta a medias del modelo produzcan igual una actividad usable, en vez de
// dejar el riesgo sin acción — que era el estado anterior.

describe('minutosDeTexto', () => {
  it('lee minutos de la prosa de la defensa', () => {
    expect(minutosDeTexto('agenda 30 min exclusivos para probar la conexión')).toBe(30)
    expect(minutosDeTexto('Define en 10 minutos cuál es el entregable')).toBe(10)
  })

  it('convierte horas a minutos', () => {
    expect(minutosDeTexto('reserva 2 h para el análisis')).toBe(120)
    expect(minutosDeTexto('dedica 1.5 horas')).toBe(90)
    expect(minutosDeTexto('dedica 1,5 horas')).toBe(90)
  })

  it('devuelve null cuando no hay duración', () => {
    expect(minutosDeTexto('documenta el error exacto y escala con quien administre la MV')).toBeNull()
  })

  it('ignora números que no son duraciones', () => {
    // "perder las horas en debug" no trae cantidad; y un monto no es tiempo.
    expect(minutosDeTexto('vas a perder las horas en debug')).toBeNull()
    expect(minutosDeTexto('el efecto volumen pasó de −$66.8M a +$117.4M')).toBeNull()
  })

  it('descarta duraciones absurdas en vez de aceptarlas', () => {
    // 40 h no es una medida de pre-mortem; casi siempre es un número mal leído.
    expect(minutosDeTexto('costó 40 horas')).toBeNull()
    expect(minutosDeTexto('tarda 2 min')).toBeNull()
  })
})

describe('tituloDeDefensa', () => {
  it('corta en el primer límite de oración', () => {
    const t = tituloDeDefensa('Prueba la conexión aislada. Si falla, escala el mismo día.')
    expect(t).toBe('Prueba la conexión aislada')
  })

  it('limpia el prefijo de flecha que trae la prosa del pre-mortem', () => {
    expect(tituloDeDefensa('→ Prueba la conexión aislada')).toBe('Prueba la conexión aislada')
  })

  it('recorta sin partir palabras a media', () => {
    const largo =
      'Antes de escribir una sola línea del Business Case haz una lista de qué negociaciones están confirmadas con evidencia documental'
    const t = tituloDeDefensa(largo)
    expect(t.length).toBeLessThanOrEqual(75)
    expect(t.endsWith('…')).toBe(true)
    // No debe cortar dentro de una palabra.
    expect(t.slice(0, -1).trim()).toBe(t.slice(0, -1).trimEnd())
    expect(largo.startsWith(t.slice(0, -1).trim())).toBe(true)
  })

  it('no truena con una defensa vacía', () => {
    expect(tituloDeDefensa('')).toBe('Medida del pre-mortem')
    expect(tituloDeDefensa('   ')).toBe('Medida del pre-mortem')
  })
})

describe('medidaDe', () => {
  it('respeta la medida que dio el modelo cuando viene bien formada', () => {
    const m = medidaDe({
      defensa: 'agenda 30 min para probar la conexión',
      medida: { titulo: 'Probar la conexión Postgres-AnyLogic aislada en la MV', estimadoMin: 45 },
    })
    expect(m.titulo).toBe('Probar la conexión Postgres-AnyLogic aislada en la MV')
    expect(m.estimadoMin).toBe(45)
  })

  it('deriva de la prosa cuando el draft es viejo y no trae medida', () => {
    // Éste es el caso de quien ya estaba planeando cuando se hizo el cambio.
    const m = medidaDe({
      defensa: '→ Antes de tocar el gemelo, agenda 30 min exclusivos para probar la conexión aislada. Si falla, escala.',
    })
    expect(m.estimadoMin).toBe(30)
    expect(m.titulo).toContain('Antes de tocar el gemelo')
    expect(m.titulo).not.toContain('Si falla')
  })

  it('cae a 30 min cuando la defensa no dice duración', () => {
    const m = medidaDe({ defensa: 'Documenta el error exacto y escala con quien administre la MV' })
    expect(m.estimadoMin).toBe(30)
  })

  it('ignora una medida a medias en vez de meter basura a la semana', () => {
    expect(medidaDe({ defensa: 'Prueba 20 min la conexión', medida: { titulo: '   ' } }).titulo).toBe(
      'Prueba 20 min la conexión'
    )
    expect(medidaDe({ defensa: 'Prueba la conexión', medida: { estimadoMin: -5 } }).estimadoMin).toBe(30)
    expect(medidaDe({ defensa: 'Prueba la conexión', medida: null }).estimadoMin).toBe(30)
  })

  it('topa duraciones desmedidas — una medida no se come la semana', () => {
    const m = medidaDe({ defensa: 'x', medida: { titulo: 'Rehacer todo', estimadoMin: 5000 } })
    expect(m.estimadoMin).toBe(480)
  })

  it('nunca devuelve título vacío', () => {
    expect(medidaDe({ defensa: '' }).titulo).not.toBe('')
  })
})

describe('refDeMedida', () => {
  it('es estable por índice — es lo que permite saber si ya se agregó', () => {
    expect(refDeMedida(0)).toBe('pm0')
    expect(refDeMedida(2)).toBe('pm2')
  })

  it('no colisiona con las refs de tareas nuevas del paso 3', () => {
    // Las del paso 3 son `n{n}-{slug}`; las medidas, `pm{i}`.
    expect(refDeMedida(1).startsWith('n')).toBe(false)
  })
})
