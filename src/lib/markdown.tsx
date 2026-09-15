import type { ReactNode } from 'react'

// A small, deliberately limited Markdown-ish renderer for event
// descriptions: paragraphs, line breaks, "-"/"*" lists, **bold**, *italic*,
// [text](url) links, and bare URLs (auto-linked). Text is only ever placed
// into React as plain strings (never dangerouslySetInnerHTML), so there's
// no HTML to sanitize.

// Trailing punctuation (. , ; : ! ? ) ' ") is almost never meant to be part
// of the URL — it's sentence punctuation that happens to follow it — so it's
// split off and rendered as plain text after the link. A trailing ")" is the
// exception: URLs legitimately end in one (e.g. a Wikipedia
// ".../Example_(disambiguation)" link), so it's only stripped when it isn't
// balanced by an opening "(" earlier in the matched URL.
function splitTrailingPunctuation(url: string): { url: string; trailing: string } {
  let end = url.length
  while (end > 0) {
    const ch = url[end - 1]
    if (ch === ')') {
      const prefix = url.slice(0, end)
      const opens = (prefix.match(/\(/g) ?? []).length
      const closes = (prefix.match(/\)/g) ?? []).length
      if (closes <= opens) break
      end--
    } else if (/[.,;:!?'"]/.test(ch)) {
      end--
    } else {
      break
    }
  }
  return { url: url.slice(0, end), trailing: url.slice(end) }
}

function bareUrlHref(url: string): string {
  return url.startsWith('www.') ? `https://${url}` : url
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern =
    /\[([^[\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|(https?:\/\/[^\s<]+|www\.[^\s<]+)/g
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
    } else if (match[5] !== undefined) {
      const { url, trailing } = splitTrailingPunctuation(match[5])
      nodes.push(
        <a key={`${keyPrefix}-${i++}`} href={bareUrlHref(url)} target="_blank" rel="noreferrer">
          {url}
        </a>
      )
      if (trailing) nodes.push(trailing)
    }
    lastIndex = pattern.lastIndex
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}

// Auto-links bare URLs in plain (non-markdown) text — form field help text,
// confirmation messages, captions, and other free-text fields that aren't
// run through renderMarkdown. No markdown syntax is interpreted here, only
// URL detection.
export function linkifyText(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let i = 0
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index))
    const { url, trailing } = splitTrailingPunctuation(match[0])
    nodes.push(
      <a key={i++} href={bareUrlHref(url)} target="_blank" rel="noreferrer">
        {url}
      </a>
    )
    if (trailing) nodes.push(trailing)
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
