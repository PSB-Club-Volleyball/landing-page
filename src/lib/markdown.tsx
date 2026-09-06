import type { ReactNode } from 'react'

// A small, deliberately limited Markdown-ish renderer for event
// descriptions: paragraphs, line breaks, "-"/"*" lists, **bold**, *italic*,
// and [text](url) links. Text is only ever placed into React as plain
// strings (never dangerouslySetInnerHTML), so there's no HTML to sanitize.

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /\[([^[\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let i = 0
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index))
    if (match[1] !== undefined) {
      nodes.push(
        <a key={`${keyPrefix}-${i++}`} href={match[2]} target="_blank" rel="noreferrer">
          {match[1]}
        </a>
      )
    } else if (match[3] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-${i++}`}>{match[3]}</strong>)
    } else if (match[4] !== undefined) {
      nodes.push(<em key={`${keyPrefix}-${i++}`}>{match[4]}</em>)
    }
    lastIndex = pattern.lastIndex
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}

export function renderMarkdown(source: string): ReactNode[] {
  const blocks = source.trim().split(/\n{2,}/)
  return blocks.map((block, bi) => {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    const isList = lines.length > 0 && lines.every((l) => /^[-*]\s+/.test(l))
    if (isList) {
      return (
        <ul key={bi}>
          {lines.map((l, li) => (
            <li key={li}>{renderInline(l.replace(/^[-*]\s+/, ''), `${bi}-${li}`)}</li>
          ))}
        </ul>
      )
    }
    return (
      <p key={bi}>
        {lines.map((l, li) => (
          <span key={li}>
            {renderInline(l, `${bi}-${li}`)}
            {li < lines.length - 1 && <br />}
          </span>
        ))}
      </p>
    )
  })
}

// Plain-text preview for card truncation: strips markdown syntax, collapses
// whitespace, and clamps to maxLen characters at a word boundary.
export function plainTextPreview(source: string, maxLen: number): { text: string; truncated: boolean } {
  const plain = source
    .replace(/\[([^[\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (plain.length <= maxLen) return { text: plain, truncated: false }
  const cut = plain.slice(0, maxLen)
  const lastSpace = cut.lastIndexOf(' ')
  return { text: `${cut.slice(0, lastSpace > 0 ? lastSpace : maxLen)}…`, truncated: true }
}
