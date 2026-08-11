// Catálogo de material de desarrollo, mapeado a las competencias que mueve.
//
// Dos reglas de curaduría, y las dos importan:
//
// 1. Nada entra sin un mapeo explícito a reactivos. Un recurso que no mueve una
//    competencia concreta es lectura general, y para eso no hace falta la app.
// 2. Los ejercicios pesan más que los libros. El 70-20-10 (McCall/Lombardo/
//    Eichinger, CCL) pone ~70% del desarrollo en el trabajo real y ~10% en
//    formación formal; los libros existen para que ese 70% sea práctica
//    deliberada —meta específica, subhabilidad aislada, retroalimentación—
//    en lugar de repetición. Ericsson fue explícito: quitas cualquiera de esos
//    tres y vuelves a práctica ingenua.
//
// El selector de competencias usa la misma llave que el schema:
//   { tipo: 'individual' }                       → todas las conductas individuales
//   { tipo: 'individual', orden: 17 }            → una conducta específica (0-indexed en el seed)
//   { tipo: 'rol', grupo: 'La mano del Rey' }    → todos los reactivos de ese rol VP
//   { tipo: 'nivel', grupo: 'Gerente', orden: 12 } → el reactivo 12 de Gerente

export type SelectorCompetencia = {
  tipo: 'individual' | 'rol' | 'nivel'
  grupo?: string
  orden?: number
}

export type RecursoSeed = {
  tipo: 'libro' | 'curso' | 'platica' | 'articulo' | 'ejercicio'
  titulo: string
  fuente?: string
  url?: string
  porQue: string
  duracionMin?: number
  cadencia?: string
  competencias: SelectorCompetencia[]
}

// ── Ejercicios ─────────────────────────────────────────────────────────────
// Van primero a propósito: son lo que convierte una oportunidad en algo
// intencional en vez de casualidad.

const EJERCICIOS: RecursoSeed[] = [
  {
    tipo: 'ejercicio',
    titulo: 'Reactivo de la semana',
    porQue:
      'Elige UNO de los reactivos de tu nivel objetivo y diseña la ocasión de ejercerlo esta semana, en el planeador. Sin esto la evidencia depende de que la oportunidad caiga sola.',
    duracionMin: 10,
    cadencia: 'semanal',
    competencias: [
      { tipo: 'nivel', grupo: 'Gerente' },
      { tipo: 'nivel', grupo: 'Gerente Sr' },
      { tipo: 'nivel', grupo: 'Director' },
    ],
  },
  {
    tipo: 'ejercicio',
    titulo: 'Grabar 3 minutos y contar muletillas',
    porQue:
      'Explica un hallazgo real en 3 min, grábate, cuenta muletillas y sustitúyelas por pausa. La literatura respalda grabación + consciencia + bajar el ritmo; ~5 disfluencias/min no dañan la efectividad percibida, así que la meta no es cero.',
    duracionMin: 15,
    cadencia: 'semanal',
    competencias: [{ tipo: 'rol', grupo: 'Quien presenta' }],
  },
  {
    tipo: 'ejercicio',
    titulo: 'Frase-respuesta antes de cada entregable',
    porQue:
      'Escribe la conclusión en una frase ANTES de armar el entregable. Es la disciplina de Minto y el campo `hipotesis` de Deliverable. Si no la puedes escribir, no entendiste el problema.',
    duracionMin: 10,
    cadencia: 'por entregable',
    competencias: [
      { tipo: 'nivel', grupo: 'Gerente', orden: 11 },
      { tipo: 'rol', grupo: 'La perfección en cada detalle' },
      { tipo: 'rol', grupo: 'Los datos duros' },
    ],
  },
  {
    tipo: 'ejercicio',
    titulo: 'Pregunta de stakeholder antes de cada junta',
    porQue:
      'Antes de ver a un stakeholder clave, escribe qué necesita ESA persona para considerar el proyecto un éxito. Es el reactivo 12 de Gerente convertido en hábito de 5 minutos.',
    duracionMin: 5,
    cadencia: 'por junta',
    competencias: [
      { tipo: 'nivel', grupo: 'Gerente', orden: 12 },
      { tipo: 'nivel', grupo: 'Gerente Sr', orden: 9 },
      { tipo: 'rol', grupo: 'La mano del Rey' },
      { tipo: 'rol', grupo: 'La estrategia que renovará al Estado' },
    ],
  },
  {
    tipo: 'ejercicio',
    titulo: 'Presentar en vez de enviar',
    porQue:
      'Un entregable presentado en persona genera evidencia de "Quien presenta" y de "La mano del Rey"; uno enviado por correo no genera ninguna. Compromete al menos uno al mes.',
    cadencia: 'mensual',
    competencias: [
      { tipo: 'rol', grupo: 'Quien presenta' },
      { tipo: 'rol', grupo: 'La mano del Rey' },
      { tipo: 'nivel', grupo: 'Consultor Sr', orden: 10 },
    ],
  },
  {
    tipo: 'ejercicio',
    titulo: 'Cerrar el pre-mortem de la semana',
    porQue:
      'Al cerrar la semana, marca qué riesgo predicho ocurrió y si tu defensa sirvió. Es evidencia fechada de capacidad predictiva — exactamente lo que pide "Quien tiene expertise técnico". Ya está en la app.',
    duracionMin: 5,
    cadencia: 'semanal',
    competencias: [{ tipo: 'rol', grupo: 'Quien tiene expertise técnico' }],
  },
  {
    tipo: 'ejercicio',
    titulo: 'Bitácora de delegación',
    porQue:
      'Marca cada tarea que hiciste tú y debió hacer un perfil más junior. El acumulado en horas es el caso de negocio con VP para pedir un reporte — y sin reporte el reactivo 10 de Gerente ("asigna tareas, retroalimenta y brinda orientación a equipos") es estructuralmente imposible de evidenciar.',
    duracionMin: 1,
    cadencia: 'por tarea',
    competencias: [
      { tipo: 'nivel', grupo: 'Gerente', orden: 10 },
      { tipo: 'nivel', grupo: 'Gerente Sr', orden: 10 },
      { tipo: 'rol', grupo: 'Quien cuida al equipo' },
    ],
  },
]

// ── Libros ─────────────────────────────────────────────────────────────────

const LIBROS: RecursoSeed[] = [
  {
    tipo: 'libro',
    titulo: 'The Pyramid Principle: Logic in Writing and Thinking',
    fuente: 'Barbara Minto',
    porQue:
      'Minto fue la primera mujer contratada post-MBA en McKinsey y escribió el estándar de comunicación de la industria; McKinsey lo sigue enseñando a sus nuevos. Respuesta primero, soporte después. Es el libro más rentable de esta lista para consultoría.',
    competencias: [
      { tipo: 'nivel', grupo: 'Gerente', orden: 11 },
      { tipo: 'rol', grupo: 'La perfección en cada detalle' },
      { tipo: 'rol', grupo: 'Quien presenta' },
    ],
  },
  {
    tipo: 'libro',
    titulo: 'Crucial Conversations',
    fuente: 'Patterson, Grenny, McMillan, Switzler',
    porQue:
      'El estándar para conversaciones de alto riesgo y alta emoción. Ataca directo la conducta "Comunica la realidad tal y como es, con apertura y honestidad", que es gravitas — el 67% de la presencia ejecutiva según Hewlett.',
    competencias: [{ tipo: 'individual' }, { tipo: 'rol', grupo: 'La mano del Rey' }],
  },
  {
    tipo: 'libro',
    titulo: 'Thanks for the Feedback',
    fuente: 'Douglas Stone y Sheila Heen (Harvard Negotiation Project)',
    porQue:
      'El lado de RECIBIR retroalimentación, que casi nadie entrena. Importa por el hallazgo de Kluger y DeNisi (1996): más de un tercio de las intervenciones de feedback EMPEORAN el desempeño. Feedback sobre la tarea, no sobre la persona.',
    competencias: [
      { tipo: 'individual' },
      { tipo: 'nivel', grupo: 'Gerente', orden: 10 },
      { tipo: 'nivel', grupo: 'Gerente Sr', orden: 12 },
    ],
  },
  {
    tipo: 'libro',
    titulo: 'The Trusted Advisor',
    fuente: 'Maister, Green y Galford',
    porQue:
      'Es literalmente el libro de la capa 2 de esta app: cómo se construye la confianza que convierte a un proveedor en asesor. Base del reactivo 12 de Gerente y del 9 de Gerente Sr.',
    competencias: [
      { tipo: 'nivel', grupo: 'Gerente', orden: 12 },
      { tipo: 'nivel', grupo: 'Gerente Sr', orden: 9 },
      { tipo: 'rol', grupo: 'La mano del Rey' },
    ],
  },
  {
    tipo: 'libro',
    titulo: 'Never Split the Difference',
    fuente: 'Chris Voss',
    porQue:
      'Mecánica táctica de negociación: etiquetado emocional, espejeo, preguntas calibradas. Aplicable el lunes en una junta con un stakeholder que se resiste.',
    competencias: [
      { tipo: 'rol', grupo: 'La estrategia que renovará al Estado' },
      { tipo: 'nivel', grupo: 'Director', orden: 10 },
    ],
  },
  {
    tipo: 'libro',
    titulo: 'Multipliers',
    fuente: 'Liz Wiseman',
    porQue:
      'Sobre líderes que multiplican la capacidad de su equipo en vez de absorberla. Es el material del reactivo 10 de Gerente y del 10 de Gerente Sr — pero ojo: esto no se estudia, se practica con gente.',
    competencias: [
      { tipo: 'nivel', grupo: 'Gerente', orden: 10 },
      { tipo: 'nivel', grupo: 'Gerente Sr', orden: 10 },
      { tipo: 'rol', grupo: 'Quien cuida al equipo' },
    ],
  },
  {
    tipo: 'libro',
    titulo: 'The First 90 Days',
    fuente: 'Michael Watkins',
    porQue:
      'Cómo asumir un rol nuevo sin quemar credibilidad en el arranque. Se lee ANTES de la promoción, no después: su valor está en los primeros 90 días de Gerente.',
    competencias: [{ tipo: 'nivel', grupo: 'Gerente', orden: 9 }],
  },
  {
    tipo: 'libro',
    titulo: 'Talk Like TED',
    fuente: 'Carmine Gallo',
    porQue:
      'Estructura y entrega de una charla: narrativa, un mensaje central, uso del cuerpo y la voz. Complementa el ejercicio de grabarte, que es donde está el trabajo real.',
    competencias: [{ tipo: 'rol', grupo: 'Quien presenta' }],
  },
  {
    tipo: 'libro',
    titulo: 'Made to Stick',
    fuente: 'Chip y Dan Heath',
    porQue:
      'Por qué unas ideas se recuerdan y otras no. Sirve al reactivo de "vincular conceptos a fenómenos cotidianos" de Quien presenta, y a que tus recomendaciones sobrevivan a la junta.',
    competencias: [{ tipo: 'rol', grupo: 'Quien presenta' }, { tipo: 'rol', grupo: 'El cerebro que crea' }],
  },
  {
    tipo: 'libro',
    titulo: 'Peak: Secrets from the New Science of Expertise',
    fuente: 'Anders Ericsson y Robert Pool',
    porQue:
      'El meta-recurso: cómo practicar deliberadamente. Léelo primero si vas a invertir un año en esto, porque determina si los otros nueve libros sirven de algo.',
    competencias: [{ tipo: 'individual' }],
  },
]

// ── Cursos, programas y artículos ──────────────────────────────────────────

const CURSOS: RecursoSeed[] = [
  {
    tipo: 'curso',
    titulo: 'Toastmasters International (club local)',
    fuente: 'Toastmasters International',
    url: 'https://www.toastmasters.org',
    porQue:
      'Práctica estructurada de oratoria con evaluación de pares y discursos improvisados. La evidencia es decente para confianza: en un estudio con 30 universitarios, 90% reportó confianza alta después vs. 37% con confianza baja antes. Advertencia honesta: NO enseña manejo de ansiedad — está construido alrededor del oficio, no de la psicología del miedo.',
    competencias: [{ tipo: 'rol', grupo: 'Quien presenta' }],
  },
  {
    tipo: 'curso',
    titulo: 'Program on Negotiation — Harvard Law School',
    fuente: 'Harvard PON',
    url: 'https://www.pon.harvard.edu',
    porQue:
      'Formación formal de negociación si quieres estructura más allá de un libro. Relevante para el salto a Director, donde el reactivo 10 es gestionar relaciones comerciales con clientes clave.',
    competencias: [
      { tipo: 'nivel', grupo: 'Director', orden: 10 },
      { tipo: 'rol', grupo: 'La estrategia que renovará al Estado' },
    ],
  },
  {
    tipo: 'articulo',
    titulo: 'The New Rules of Executive Presence',
    fuente: 'Harvard Business Review (2024)',
    url: 'https://hbr.org/2024/01/the-new-rules-of-executive-presence',
    porQue:
      'La descomposición de Hewlett: gravitas 67%, comunicación 28%, apariencia 5%, sobre ~4,000 profesionales — y la presencia ejecutiva pesa ~26% de lo que decide una promoción. Sirve para no gastar el esfuerzo en el 5%.',
    competencias: [{ tipo: 'individual' }, { tipo: 'rol', grupo: 'La mano del Rey' }],
  },
  {
    tipo: 'articulo',
    titulo: 'The Effects of Feedback Interventions on Performance (meta-análisis)',
    fuente: 'Kluger y DeNisi, Psychological Bulletin 119(2), 1996',
    url: 'https://cris.huji.ac.il/en/publications/the-effects-of-feedback-interventions-on-performance-a-historical/',
    porQue:
      '607 tamaños de efecto sobre 23,663 observaciones: mejora promedio d=0.41, pero más de un tercio de las intervenciones EMPEORAN el desempeño. Léelo antes de empezar a dar retroalimentación a un equipo, que es el reactivo 10 de Gerente.',
    competencias: [
      { tipo: 'nivel', grupo: 'Gerente', orden: 10 },
      { tipo: 'nivel', grupo: 'Gerente Sr', orden: 12 },
    ],
  },
  {
    tipo: 'articulo',
    titulo: 'The 70-20-10 Rule for Leadership Development',
    fuente: 'Center for Creative Leadership',
    url: 'https://www.ccl.org/articles/leading-effectively-articles/70-20-10-rule/',
    porQue:
      '~70% del desarrollo viene del trabajo real, 20% de mentores y pares, 10% de formación. Las proporciones exactas NO están validadas empíricamente (DDI midió 52/27/21), pero la jerarquía aguanta: este catálogo entero es el 10%.',
    competencias: [{ tipo: 'individual' }],
  },
]

export const RECURSOS_DESARROLLO: RecursoSeed[] = [...EJERCICIOS, ...LIBROS, ...CURSOS]
