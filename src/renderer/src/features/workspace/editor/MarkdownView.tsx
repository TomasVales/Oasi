import { useEffect, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { Mathematics } from '@tiptap/extension-mathematics'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import { cn } from '@/lib/cn'

const lowlight = createLowlight(common)

/**
 * Markdown de solo lectura con el mismo render que los apuntes (KaTeX, código).
 * Pasa por el esquema de ProseMirror, así que el texto de la IA nunca se inyecta como HTML.
 * Durante el streaming se actualiza como máximo cada 80 ms.
 */
export function MarkdownView({ markdown, className }: { markdown: string; className?: string }) {
  const editor = useEditor({
    editable: false,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    extensions: [
      StarterKit.configure({ codeBlock: false, link: { openOnClick: false } }),
      CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }),
      Mathematics.configure({ katexOptions: { throwOnError: false } }),
      Markdown
    ],
    content: markdown,
    contentType: 'markdown',
    editorProps: { attributes: { class: 'note-prose note-prose--compact' } }
  })

  const pending = useRef<number | null>(null)
  useEffect(() => {
    if (!editor) return
    if (pending.current) window.clearTimeout(pending.current)
    pending.current = window.setTimeout(() => {
      editor.commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false })
    }, 80)
    return () => {
      if (pending.current) window.clearTimeout(pending.current)
    }
  }, [editor, markdown])

  return <EditorContent editor={editor} className={cn('selectable', className)} />
}
