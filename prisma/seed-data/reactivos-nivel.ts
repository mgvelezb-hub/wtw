// Sección 2 del instrumento de VP: "Comportamientos esperados para la contribución
// del equipo de alto desempeño", reactivos por nivel. Transcrito literal de
// `Expectations Vp.pdf` (2026-08-10) — no parafrasear: es el texto contra el que
// evalúan.
//
// La escala del instrumento es de 4 puntos: a) Sobresaliente, b) Satisfactorio,
// c) Se perciben brechas, d) No aplica (no hubo suficiente exposure para
// responder). Si se responde "se perciben brechas" se pide el por qué con un
// ejemplo.
//
// El número de cada reactivo es el del documento (arrancan en 9 porque la
// sección 1 ocupa del 1 al 8), y se conserva para que una conversación de
// evaluación pueda referirse a "el reactivo 10 de Gerente" sin ambigüedad.

export type ReactivoNivel = { numero: number; texto: string }

export const REACTIVOS_POR_NIVEL: Record<string, ReactivoNivel[]> = {
  Trainee: [
    { numero: 9, texto: 'Establece relaciones causa efecto a partir de análisis numéricos y/o de conceptos' },
    { numero: 10, texto: 'Presenta de manera pragmática y oportuna los hallazgos de sus análisis' },
  ],
  Analista: [
    {
      numero: 9,
      texto:
        'Tiene la capacidad de definir metodología y capturar información de valor en procesos de levantamiento: entrevistas, cuestionarios, caminado de procesos, etc',
    },
    {
      numero: 10,
      texto:
        'Se vincula con las posiciones operativas de la organización y del cliente, estableciendo vínculos de comunicación, confianza e influencia',
    },
    {
      numero: 11,
      texto:
        'Presenta una alta capacidad para interpretar datos y analizar resultados, utilizando técnicas y herramientas que eficienten las necesidades de información en los proyectos',
    },
  ],
  Consultor: [
    {
      numero: 9,
      texto:
        'Tiene capacidad de gestionar al equipo (del cliente e interno) para hacer cumplir los acuerdos que nos lleven a la solución',
    },
    { numero: 10, texto: 'Propone y ejecuta soluciones frente a problemáticas específicas dentro de un tramo de proyecto' },
    { numero: 11, texto: 'Presenta frente a cliente y facilita sesiones de trabajo dentro del tramo de proyecto que le corresponde' },
  ],
  'Consultor Sr': [
    { numero: 9, texto: 'Tiene capacidad para gestionar equipos (del cliente e interno) en tramos relacionados con su especialidad' },
    { numero: 10, texto: 'Presenta frente a cliente y facilita sesiones de trabajo dentro de su especialidad' },
    {
      numero: 11,
      texto: 'Desarrolla y/o aplica soluciones que producen valor o que son nuevas para el equipo en su área de especialidad',
    },
  ],
  Gerente: [
    { numero: 9, texto: 'Lidera proyectos o tramos táctico-operativos, acompañado/soportado por un director y/o socio' },
    { numero: 10, texto: 'Asigna tareas, retroalimenta y brinda orientación a equipos dedicados al despliegue de un tramo' },
    { numero: 11, texto: 'Propone soluciones de un tramo de proyecto a partir de literatura o experiencias en otros proyectos' },
    { numero: 12, texto: 'Establece relaciones de proximidad con stakeholders claves del cliente' },
  ],
  'Gerente Sr': [
    {
      numero: 9,
      texto:
        'Establece relaciones de proximidad con stakeholders claves del cliente, para identificar, incentivar y posicionar oportunidades comerciales',
    },
    { numero: 10, texto: 'Gestiona el desempeño y desarrollo de miembros de equipos multidisciplinarios de manera simultánea' },
    {
      numero: 11,
      texto:
        'Propone soluciones de un proyecto estratégico y/o desarrolla metodologías a partir de literatura o experiencias en otros proyectos, tomando en cuenta la interacción entre los individuos responsables de ejecutarlo',
    },
    {
      numero: 12,
      texto:
        'Proporciona retroalimentación objetiva, positiva, accionable y oportuna, para potenciar la dinámica de equipo de alto desempeño',
    },
  ],
  Director: [
    { numero: 9, texto: 'Dirige programas de transformación e integra los tramos que le corresponden' },
    { numero: 10, texto: 'Gestiona relaciones comerciales con clientes clave' },
    {
      numero: 11,
      texto: 'Desarrolla marcos metodológicos y enfoques de solución aterrizado a problemáticas endémicas de los clientes de VP',
    },
    {
      numero: 12,
      texto: 'Desarrolla estrategias de innovación permanentes: acomodo al cambio incesante, más que esfuerzo por controlarlo',
    },
  ],
  // Socio NO viene en el documento de VP. Mau indica que son todas las anteriores
  // más las responsabilidades de ser socio de una firma de consultoría para
  // empresas grandes. Se deja vacío a propósito: inventar el texto oficial de un
  // nivel de evaluación sería peor que no tenerlo. Cuando VP lo publique, se
  // agrega aquí.
  Socio: [],
}

// El escalafón completo, en orden. Antes el seed arrancaba en Analista y se
// cortaba en Gerente Sr.
export const ESCALAFON_VP = [
  'Trainee',
  'Analista',
  'Consultor',
  'Consultor Sr',
  'Gerente',
  'Gerente Sr',
  'Director',
  'Socio',
] as const

// Escala de evaluación del instrumento, para la autoevaluación.
export const ESCALA_VP = [
  { clave: 'sobresaliente', etiqueta: 'Sobresaliente' },
  { clave: 'satisfactorio', etiqueta: 'Satisfactorio' },
  { clave: 'brechas', etiqueta: 'Se perciben brechas' },
  { clave: 'no_aplica', etiqueta: 'No aplica (sin exposure suficiente)' },
] as const
