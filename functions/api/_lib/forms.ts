import type { Env } from './env'

export const FIELD_TYPES = [
  'text',
  'textarea',
  'select',
  'radio',
  'checkbox_group',
  'number',
  'checkbox',
  'date',
  'time',
  'email',
  'phone',
  'linear_scale',
  'section',
] as const
export type FieldType = (typeof FIELD_TYPES)[number]

// Field types that offer "|"-separated choices, same convention as before.
export const CHOICE_FIELD_TYPES: FieldType[] = ['select', 'radio', 'checkbox_group']

interface FormFieldRow {
  id: number
  form_id: number
  label: string
  field_type: string
  options: string | null
  required: number
  sort_order: number
  description: string | null
  min_value: number | null
  max_value: number | null
  pattern: string | null
}

export function toFormField(row: FormFieldRow) {
  return { ...row, required: Boolean(row.required) }
}

export async function fetchFormFields(env: Env, formId: number) {
  const rows = await env.DB.prepare(
    `SELECT * FROM form_fields WHERE form_id = ?1 ORDER BY sort_order ASC, id ASC`
  )
    .bind(formId)
    .all<FormFieldRow>()
  return (rows.results ?? []).map(toFormField)
}

export type PublicFormField = ReturnType<typeof toFormField>

// Server-side mirror of the client-side checks the signup form already
// applies via input attributes (required/min/max/pattern) — a submission
// can't skip them just by calling the API directly. Returns an error
// message, or null when the answer is fine. `raw` is the answer as
// submitted for this field, or undefined when the visitor left it blank.
export function validateAnswer(field: PublicFormField, raw: string | undefined): string | null {
  if (field.field_type === 'section') return null

  const value = (raw ?? '').trim()
  if (field.required && !value) return `"${field.label}" is required`
  if (!value) return null

  if (CHOICE_FIELD_TYPES.includes(field.field_type as FieldType)) {
    const options = new Set((field.options ?? '').split('|').map((o) => o.trim()).filter(Boolean))
    const chosen = field.field_type === 'checkbox_group' ? value.split('|').map((v) => v.trim()) : [value]
    if (chosen.some((c) => !options.has(c))) return `"${field.label}" has an invalid choice`
    return null
  }

  if (field.field_type === 'number' || field.field_type === 'linear_scale') {
    const n = Number(value)
    if (!Number.isFinite(n)) return `"${field.label}" must be a number`
    if (field.min_value != null && n < field.min_value) return `"${field.label}" must be at least ${field.min_value}`
    if (field.max_value != null && n > field.max_value) return `"${field.label}" must be at most ${field.max_value}`
    return null
  }

  if (field.field_type === 'text' || field.field_type === 'textarea') {
    if (field.min_value != null && value.length < field.min_value) {
      return `"${field.label}" must be at least ${field.min_value} characters`
    }
    if (field.max_value != null && value.length > field.max_value) {
      return `"${field.label}" must be at most ${field.max_value} characters`
    }
  }

  if (field.pattern) {
    try {
      if (!new RegExp(field.pattern).test(value)) return `"${field.label}" isn't in the expected format`
    } catch {
      // an invalid stored pattern shouldn't block every submission
    }
  }

  if (field.field_type === 'email') {
    const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!EMAIL_PATTERN.test(value)) return `"${field.label}" must be a valid email`
  }

  return null
}
