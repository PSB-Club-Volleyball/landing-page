import type { Env } from './env'

export const FIELD_TYPES = ['text', 'textarea', 'select', 'number', 'checkbox'] as const
export type FieldType = (typeof FIELD_TYPES)[number]

interface FormFieldRow {
  id: number
  form_id: number
  label: string
  field_type: string
  options: string | null
  required: number
  sort_order: number
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
