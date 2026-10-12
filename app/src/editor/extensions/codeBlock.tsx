import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react'
import { common, createLowlight } from 'lowlight'
import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

export const lowlight = createLowlight(common)

const LANGS: [string, string][] = [
  ['', 'Plain text'],
  ['bash', 'Bash'],
  ['c', 'C'],
  ['cpp', 'C++'],
  ['csharp', 'C#'],
  ['css', 'CSS'],
  ['diff', 'Diff'],
  ['go', 'Go'],
  ['xml', 'HTML'],
  ['java', 'Java'],
  ['javascript', 'JavaScript'],
  ['json', 'JSON'],
  ['kotlin', 'Kotlin'],
  ['lua', 'Lua'],
  ['markdown', 'Markdown'],
  ['php', 'PHP'],
  ['python', 'Python'],
  ['ruby', 'Ruby'],
  ['rust', 'Rust'],
  ['scss', 'SCSS'],
  ['shell', 'Shell'],
  ['sql', 'SQL'],
  ['swift', 'Swift'],
  ['typescript', 'TypeScript'],
  ['yaml', 'YAML'],
]

function CodeBlockView({ node, updateAttributes }: ReactNodeViewProps) {
  const lang = (node.attrs.language as string | null) ?? ''
  const [copied, setCopied] = useState(false)
  const known = LANGS.some(([v]) => v === lang)
  return (
    <NodeViewWrapper className="code-block">
      <div className="code-block-bar" contentEditable={false}>
        <select value={lang} onChange={(e) => updateAttributes({ language: e.target.value || null })} aria-label="Language">
          {!known && <option value={lang}>{lang}</option>}
          {LANGS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="code-copy"
          onClick={() => {
            void navigator.clipboard?.writeText(node.textContent)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre spellCheck={false}>
        <NodeViewContent<'code'> as="code" className={lang ? `hljs language-${lang}` : 'hljs'} />
      </pre>
    </NodeViewWrapper>
  )
}

export const CodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView)
  },
}).configure({ lowlight, defaultLanguage: null })
