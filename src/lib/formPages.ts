import type { FieldType } from '../types'

// The subset of a form field FieldInput/buildPages actually need to render —
// satisfied by both a saved FormField and an in-progress FormFieldInput (the
// admin form builder's draft shape), so the public signup form and the
// admin preview can share this exact rendering code instead of two copies
// that could drift apart.
export interface PreviewableField {
  id: number
  label: string
  field_type: FieldType
  options: string | null
  required: boolean
  description: string | null
  min_value: number | null
  max_value: number | null
  pattern: string | null
}

export interface Page {
  heading: PreviewableField | null
  fields: PreviewableField[]
}

// Fields are laid out in submit order; a 'section' field is a page break —
// it renders as a heading, and everything after it (up to the next section)
// becomes a new page, mirroring Google Forms' section-per-page behavior.
export function buildPages(fields: PreviewableField[]): Page[] {
  const pages: Page[] = [{ heading: null, fields: [] }]
  for (const field of fields) {
    if (field.field_type === 'section') {
      pages.push({ heading: field, fields: [] })
    } else {
      pages[pages.length - 1].fields.push(field)
    }
  }
  return pages.filter((p) => p.heading || p.fields.length > 0)
}
