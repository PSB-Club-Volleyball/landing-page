// Minimal RFC4180-ish CSV encode/decode for admin export/import — plain
// tabular data (names, emails, numbers), so this only needs to get quoting
// right, not full spreadsheet-CSV dialect support.

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(escapeCsvField).join(',')]
  for (const row of rows) {
    lines.push(row.map((v) => escapeCsvField(v == null ? '' : String(v))).join(','))
  }
  return lines.join('\r\n')
}

function triggerDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Triggers a browser download of `csv` as `filename` — no server round trip,
// the data's already in hand from the admin table's own state.
export function downloadCsv(filename: string, csv: string) {
  triggerDownload(filename, new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
}

// Triggers a browser download of an email list as a one-column CSV — one
// address per line, comma-separated so it pastes straight into a To/BCC
// field. Trimmed, blanks dropped, de-duplicated case-insensitively (first
// spelling kept).
export function downloadEmailList(filename: string, emails: (string | null | undefined)[]) {
  const seen = new Set<string>()
  const list: string[] = []
  for (const raw of emails) {
    const email = (raw ?? '').trim()
    if (!email) continue
    const key = email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    list.push(email)
  }
  triggerDownload(filename, new Blob([list.join(',\r\n')], { type: 'text/csv;charset=utf-8;' }))
}

// Parses CSV text into rows of string cells. Handles quoted fields (commas,
// quotes, and newlines inside quotes) and both \r\n and \n line endings.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += c
      i++
      continue
    }
    if (c === '"') {
      inQuotes = true
      i++
      continue
    }
    if (c === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (c === '\r') {
      i++
      continue
    }
    if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += c
    i++
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''))
}

// Maps parsed CSV rows (first row = header) to plain objects, matching each
// header case/whitespace-insensitively against `columns` (accepted header
// text -> canonical field name). Unrecognized columns are ignored, so a
// spreadsheet with extra notes columns still imports the columns it knows.
export function csvRowsToObjects(rows: string[][], columns: Record<string, string>): Record<string, string>[] {
  if (rows.length === 0) return []
  const [headerRow, ...dataRows] = rows
  const keys = headerRow.map((h) => columns[h.trim().toLowerCase()] ?? null)
  return dataRows.map((r) => {
    const obj: Record<string, string> = {}
    keys.forEach((key, i) => {
      if (key) obj[key] = (r[i] ?? '').trim()
    })
    return obj
  })
}
