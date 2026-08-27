export { FIELD_TYPES, fetchFormFields, toFormField, type FieldType } from '../../_lib/forms'
import { FIELD_TYPES } from '../../_lib/forms'

export interface FormFieldInput {
  id?: number
  label: string
  field_type: (typeof FIELD_TYPES)[number]
  options?: string | null
  required?: boolean
  sort_order?: number
}

// Validates a form's field list. 'select' fields must carry at least one
// "|"-separated option; every other type ignores `options`.
export function validateFields(fields: unknown): string | null {
  if (!Array.isArray(fields) || fields.length === 0) return 'A form needs at least one field'

  for (const f of fields as FormFieldInput[]) {
    if (!f || typeof f.label !== 'string' || !f.label.trim()) return 'Every field needs a label'
    if (!FIELD_TYPES.includes(f.field_type)) return `Invalid field_type: ${f.field_type}`
    if (f.field_type === 'select' && (!f.options || !f.options.trim())) {
      return `"${f.label}" is a single-choice field and needs options`
    }
  }
  return null
}
