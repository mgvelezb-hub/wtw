import { describe, it, expect } from 'vitest'
import { conteoPorProyecto, filtrarPendientes, SIN_PROYECTO } from '@/lib/filtrar-pendientes'

// Una bandeja de 33 tareas en 9 proyectos deja de ser lista y pasa a ser pajar.
const BANDEJA = [
  { id: '1', titulo: 'Auditar output de la última corrida', proyecto: 'Cuervo' },
  { id: '2', titulo: 'Actualizar documentación del gemelo', proyecto: 'Cuervo' },
  { id: '3', titulo: 'Matriz y flujo de base de costos', proyecto: 'Liverpool' },
  { id: '4', titulo: 'QA de la app de punto de venta', proyecto: 'Recaudería Rulas' },
  { id: '5', titulo: 'Algo suelto', proyecto: null },
]

describe('conteoPorProyecto', () => {
  it('ordena por cantidad y deja "Sin proyecto" al final', () => {
    // Los proyectos con más trabajo pendiente quedan al alcance del pulgar; el
    // cajón de lo no decidido no compite por ese lugar.
    expect(conteoPorProyecto(BANDEJA)).toEqual([
      { proyecto: 'Cuervo', cuantas: 2 },
      { proyecto: 'Liverpool', cuantas: 1 },
      { proyecto: 'Recaudería Rulas', cuantas: 1 },
      { proyecto: SIN_PROYECTO, cuantas: 1 },
    ])
  })
})

describe('filtrarPendientes', () => {
  it('sin filtro devuelve todo', () => {
    expect(filtrarPendientes(BANDEJA, {})).toHaveLength(5)
  })

  it('filtra por proyecto', () => {
    expect(filtrarPendientes(BANDEJA, { proyecto: 'Cuervo' }).map((t) => t.id)).toEqual(['1', '2'])
  })

  it('agrupa lo que no tiene proyecto bajo la misma etiqueta', () => {
    expect(filtrarPendientes(BANDEJA, { proyecto: SIN_PROYECTO }).map((t) => t.id)).toEqual(['5'])
  })

  it('encuentra sin acentos', () => {
    // "Auditoría" tecleado de prisa en una tableta sale sin tilde.
    expect(filtrarPendientes(BANDEJA, { texto: 'ultima' }).map((t) => t.id)).toEqual(['1'])
  })

  it('las palabras valen en cualquier orden', () => {
    // Exigir la frase exacta obligaría a recordar el título completo.
    expect(filtrarPendientes(BANDEJA, { texto: 'costos matriz' }).map((t) => t.id)).toEqual(['3'])
  })

  it('el texto también busca en el nombre del proyecto', () => {
    expect(filtrarPendientes(BANDEJA, { texto: 'rulas' }).map((t) => t.id)).toEqual(['4'])
  })

  it('proyecto y texto se combinan', () => {
    expect(filtrarPendientes(BANDEJA, { proyecto: 'Cuervo', texto: 'gemelo' }).map((t) => t.id)).toEqual(['2'])
  })
})
