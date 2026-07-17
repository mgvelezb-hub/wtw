import type { StatusContext } from '@/lib/ai/status-context'

// Contexto de insumos REALISTA reconstruido de la semana W29 de Liverpool
// (2026-07-08 a 2026-07-15), con el shape EXACTO de StatusContext
// (src/lib/ai/status-context.ts). Usado como insumo determinista para los
// evals de tests/ai/status-eval.test.ts — ver
// docs/plans/2026-07-16-fase7-pmo-ia-design.md §6 Tarea 8.
//
// statusAnterior: null — simula la primera generación (sin continuidad),
// para que el eval de cobertura se apoye únicamente en insumos de esta
// semana, no en texto previo.
export const contextoW29Liverpool: StatusContext = {
  rangoDesde: '2026-07-08T00:00:00.000Z',
  statusAnterior: null,

  avances: [
    {
      id: 'task-avance-1',
      titulo: 'Corrida de regiones con data 2026 (forecast demanda)',
      updatedAt: '2026-07-14T18:30:00.000Z',
      dodItems: [
        { id: 'dod-1', texto: 'Alex corrió el gemelo con data 2026 por región' },
        { id: 'dod-2', texto: 'Resultados comparados contra el forecast con metodología alterna' },
      ],
    },
    {
      id: 'task-avance-2',
      titulo: 'Material de soporte del entregable Fase 2 (KPIs)',
      updatedAt: '2026-07-15T13:00:00.000Z',
      dodItems: [
        { id: 'dod-3', texto: 'Clau armó el material de soporte para el entregable F2' },
      ],
    },
    {
      id: 'task-avance-3',
      titulo: 'Slide de solicitud de extensión de alcance',
      updatedAt: '2026-07-15T20:00:00.000Z',
      dodItems: [{ id: 'dod-4', texto: 'Slide de extensión listo para revisión de Mau' }],
    },
  ],

  enCurso: [
    {
      id: 'task-encurso-1',
      titulo: 'Forecast de demanda 2026 con costo proyectado',
      estatus: 'in_progress',
      bloques: [
        { fecha: '2026-07-17T00:00:00.000Z', inicio: '09:00', fin: '11:00' },
      ],
    },
    {
      id: 'task-encurso-2',
      titulo: 'KPIs $/pieza vs 2025 y vs presupuesto',
      estatus: 'in_progress',
      bloques: [
        { fecha: '2026-07-17T00:00:00.000Z', inicio: '11:00', fin: '13:00' },
      ],
    },
    {
      id: 'task-encurso-3',
      titulo: 'PPT de avance para Miguel Jiménez (MB)',
      estatus: 'planned',
      bloques: [
        { fecha: '2026-07-18T00:00:00.000Z', inicio: '10:00', fin: '12:00' },
      ],
    },
    {
      id: 'task-encurso-4',
      titulo: 'Análisis de productividad de proveedores 2026',
      estatus: 'in_progress',
      bloques: [
        { fecha: '2026-07-16T00:00:00.000Z', inicio: '15:00', fin: '17:00' },
      ],
    },
    {
      id: 'task-encurso-5',
      titulo: 'Simulación de ventanas nocturnas (56 TDs)',
      estatus: 'planned',
      bloques: [
        { fecha: '2026-07-18T00:00:00.000Z', inicio: '16:00', fin: '18:00' },
      ],
    },
  ],

  minutasNuevas: [
    {
      id: 'minuta-status-w29',
      fecha: '2026-07-15T00:00:00.000Z',
      titulo: 'Reunión de status semanal Liverpool ET',
      asistentes: ['Mau', 'Carlos', 'Kevin', 'Noé', 'Miguel Jiménez'],
      items: [
        {
          id: 'item-acuerdo-truckfill',
          tipo: 'acuerdo',
          texto:
            'Carlos reiteró que los hallazgos/quick wins de TruckFill se entreguen solo como recomendación, sin profundizar el análisis, y que el foco siga en los paquetes de negociación',
          responsable: 'Carlos',
          fechaCompromiso: null,
          estado: 'abierto',
        },
        {
          id: 'item-pendiente-cliente-noe',
          tipo: 'pendiente_cliente',
          texto: 'Noé comparte el listado de las 56 TDs que cambiarán a ventana nocturna',
          responsable: 'Noé',
          fechaCompromiso: '2026-07-15T00:00:00.000Z',
          estado: 'abierto',
        },
        {
          id: 'item-decision-tarifas',
          tipo: 'decision',
          texto:
            'Kevin pidió reunión mañana 11 am para revisar tarifas Spot/Dedicados usando el forecast 2026 a nivel viaje como base del presupuesto 2027',
          responsable: 'Kevin',
          fechaCompromiso: '2026-07-16T11:00:00.000Z',
          estado: 'abierto',
        },
      ],
    },
  ],

  esperas: [
    {
      id: 'issue-mario-truckfill',
      tipo: 'pendiente',
      tema: 'TruckFill Big Ticket',
      descripcion: 'Sigue sin respuesta de Mario sobre la fecha de visita para revisar las oportunidades',
      responsable: 'Mario',
      fechaCompromiso: null,
      ultimoSeguimiento: '2026-07-14T00:00:00.000Z',
      numSeguimientos: 3,
      createdAt: '2026-06-24T00:00:00.000Z',
    },
    {
      id: 'issue-ricardo-anticipo',
      tipo: 'pendiente',
      tema: 'Facturación — anticipo',
      descripcion: 'Ricardo (Finanzas) debe compartir el comprobante de liberación y fecha de pago del anticipo',
      responsable: 'Ricardo',
      fechaCompromiso: '2026-07-16T00:00:00.000Z',
      ultimoSeguimiento: '2026-07-15T00:00:00.000Z',
      numSeguimientos: 1,
      createdAt: '2026-07-15T00:00:00.000Z',
    },
    {
      id: 'issue-isa-acceso',
      tipo: 'pendiente',
      tema: 'Acceso corporativo',
      descripcion: 'Isa debe confirmar el acceso a la red corporativa de Liverpool para el equipo consultor',
      responsable: 'Isa',
      fechaCompromiso: null,
      ultimoSeguimiento: '2026-07-10T00:00:00.000Z',
      numSeguimientos: 2,
      createdAt: '2026-07-01T00:00:00.000Z',
    },
  ],

  entregables: [
    {
      id: 'entregable-f2-kpis',
      nombre: 'Fase 2 — KPIs de transporte',
      numeroSow: 'SOW-02',
      estatus: 'rev_interna',
      fechaComprometida: '2026-07-25T00:00:00.000Z',
      fechaProyectada: '2026-07-25T00:00:00.000Z',
      avancePct: 70,
    },
    {
      id: 'entregable-truckfill',
      nombre: 'TruckFill Big Ticket — recomendación',
      numeroSow: 'SOW-05',
      estatus: 'borrador',
      fechaComprometida: '2026-08-05T00:00:00.000Z',
      fechaProyectada: '2026-08-12T00:00:00.000Z',
      avancePct: 20,
    },
  ],

  whitelist: [
    'Mau',
    'Alex',
    'Clau',
    'Carlos',
    'Noé',
    'Kevin',
    'Mario',
    'Ricardo',
    'Isa',
    'Miguel Jiménez',
    'Liverpool',
    'El Puerto de Liverpool',
  ],
}
