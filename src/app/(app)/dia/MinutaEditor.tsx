'use client'

import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TextStyleKit } from '@tiptap/extension-text-style'
import { TableKit } from '@tiptap/extension-table'
import { Placeholder } from '@tiptap/extensions'
import { useEffect } from 'react'

// StarterKit v3 ya trae bold/italic/underline/strike/listas/headings — registrarlos
// otra vez dispara warning de extensión duplicada. TextStyleKit aporta color y
// tamaño de fuente; TableKit aporta tabla + fila + celda + encabezado.
function extensionsCon(placeholder: string) {
  return [
    StarterKit,
    TextStyleKit,
    TableKit.configure({ table: { resizable: false } }),
    Placeholder.configure({ placeholder }),
  ]
}

const COLORES: { nombre: string; valor: string }[] = [
  { nombre: 'Negro', valor: '#171717' },
  { nombre: 'Teal VP', valor: '#0A7C82' },
  { nombre: 'Dorado', valor: '#B45000' },
  { nombre: 'Rojo', valor: '#B43232' },
  { nombre: 'Verde', valor: '#15803D' },
]

const TAMANOS: { nombre: string; valor: string }[] = [
  { nombre: 'Chico', valor: '12px' },
  { nombre: 'Normal', valor: '14px' },
  { nombre: 'Grande', valor: '18px' },
  { nombre: 'Título', valor: '24px' },
]

// `editor.getText()` separa cada nodo de bloque con saltos de línea, así que una
// tabla sale como una pila de celdas ("Concepto\n\n\n\nValor\n\n\n\n…"). Ese texto
// termina siendo el TÍTULO de la Task al promover el item y entra a los prompts de
// IA, así que la derivación tiene que ser legible: celdas separadas por " | ",
// una línea por fila.
function plainTextDeDoc(doc: Editor['state']['doc']): string {
  const lineas: string[] = []
  function recorrer(node: Parameters<Parameters<typeof doc.forEach>[0]>[0]) {
    if (node.type.name === 'table') {
      node.forEach((fila) => {
        const celdas: string[] = []
        fila.forEach((celda) => celdas.push(celda.textContent.trim()))
        const linea = celdas.join(' | ').trim()
        if (linea.replace(/\|/g, '').trim()) lineas.push(linea)
      })
      return
    }
    if (node.isTextblock) {
      const t = node.textContent.trim()
      if (t) lineas.push(t)
      return
    }
    node.forEach(recorrer)
  }
  doc.forEach(recorrer)
  return lineas.join('\n')
}

function Btn({
  onClick,
  activo,
  titulo,
  children,
}: {
  onClick: () => void
  activo?: boolean
  titulo: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      aria-pressed={!!activo}
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs font-semibold leading-none ${
        activo ? 'bg-[#0c4a45] text-white' : 'text-neutral-700 hover:bg-neutral-200'
      }`}
    >
      {children}
    </button>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-t-md border border-b-0 border-neutral-300 bg-neutral-50 px-1.5 py-1">
      <Btn titulo="Negrita" activo={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <span className="font-bold">B</span>
      </Btn>
      <Btn titulo="Cursiva" activo={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <span className="italic">I</span>
      </Btn>
      <Btn
        titulo="Subrayado"
        activo={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <span className="underline">U</span>
      </Btn>

      <span className="mx-1 h-4 w-px bg-neutral-300" />

      <Btn
        titulo="Lista con viñetas"
        activo={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        • Lista
      </Btn>
      <Btn
        titulo="Lista numerada"
        activo={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1. Lista
      </Btn>

      <span className="mx-1 h-4 w-px bg-neutral-300" />

      <select
        title="Tamaño de fuente"
        aria-label="Tamaño de fuente"
        value={(editor.getAttributes('textStyle').fontSize as string) || '14px'}
        onChange={(e) => editor.chain().focus().setFontSize(e.target.value).run()}
        className="rounded border border-neutral-300 bg-white px-1 py-0.5 text-xs"
      >
        {TAMANOS.map((t) => (
          <option key={t.valor} value={t.valor}>
            {t.nombre}
          </option>
        ))}
      </select>

      <select
        title="Color de texto"
        aria-label="Color de texto"
        value={(editor.getAttributes('textStyle').color as string) || '#171717'}
        onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
        className="rounded border border-neutral-300 bg-white px-1 py-0.5 text-xs"
      >
        {COLORES.map((c) => (
          <option key={c.valor} value={c.valor}>
            {c.nombre}
          </option>
        ))}
      </select>

      <span className="mx-1 h-4 w-px bg-neutral-300" />

      <Btn
        titulo="Insertar tabla 3×3 con encabezado"
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        ▦ Tabla
      </Btn>
      {editor.isActive('table') && (
        <>
          <Btn titulo="Agregar fila" onClick={() => editor.chain().focus().addRowAfter().run()}>
            +Fila
          </Btn>
          <Btn titulo="Agregar columna" onClick={() => editor.chain().focus().addColumnAfter().run()}>
            +Col
          </Btn>
          <Btn titulo="Eliminar tabla" onClick={() => editor.chain().focus().deleteTable().run()}>
            ✕ Tabla
          </Btn>
        </>
      )}
    </div>
  )
}

export function MinutaEditor({
  html,
  onChange,
  placeholder,
}: {
  html: string
  onChange: (payload: { html: string; texto: string }) => void
  placeholder?: string
}) {
  const editor = useEditor({
    extensions: extensionsCon(placeholder ?? ''),
    content: html,
    // Evita el error de hidratación de TipTap en SSR (el editor solo existe en cliente).
    immediatelyRender: false,
    editorProps: {
      attributes: {
        // El ancho lo fija el drawer: el editor crece hacia abajo, nunca a los lados.
        class:
          'min-h-[4.5rem] max-h-80 w-full overflow-y-auto rounded-b-md border border-neutral-300 px-2 py-1.5 text-sm focus:outline-none',
      },
    },
    onUpdate: ({ editor }) => {
      // `texto` plano es la fuente de verdad para promoción a Task/Issue y para la
      // IA; el HTML es solo presentación. Se derivan juntos en cada cambio.
      onChange({ html: editor.getHTML(), texto: plainTextDeDoc(editor.state.doc) })
    },
  })

  // Cuando el drawer limpia el campo tras guardar un item, el editor debe vaciarse.
  useEffect(() => {
    if (!editor) return
    if (html === '' && editor.getText() !== '') editor.commands.clearContent()
  }, [html, editor])

  if (!editor) return null

  return (
    <div className="mt-2">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}
