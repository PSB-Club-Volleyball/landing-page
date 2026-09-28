export { FIELD_TYPES, CHOICE_FIELD_TYPES, fetchFormFields, toFormField, type FieldType } from '../../_lib/forms'
import { CHOICE_FIELD_TYPES, FIELD_TYPES, type FieldType } from '../../_lib/forms'

export interface FormFieldInput {
  id?: number
  label: string
  field_type: FieldType
  options?: string | null
  required?: boolean
  sort_order?: number
  description?: string | null
  min_value?: number | null
  max_value?: number | null
  pattern?: string | null
}

// Validates a form's field list.
//  - Choice fields ('select' | 'radio' | 'checkbox_group') need at least one
//    "|"-separated option.
//  - 'linear_scale' needs a min/max range (min < max).
//  - 'text' | 'textarea' | 'number' | 'linear_scale' may carry a min/max
//    bound; when both are given, min must not exceed max.
//  - 'text' | 'email' | 'phone' may carry a regex `pattern`; it must compile.
//  - 'section' is a page break, not an input — it ignores every input-only
//    property (options/required/min/max/pattern).
export function validateFields(fields: unknown): string | null {
  if (!Array.isArray(fields) || fields.length === 0) return 'A form needs at least one field'

  // JSON types first: the checks below call .trim() on options and compare
  // min/max, so a wrongly-typed field would throw instead of getting a 400.
  for (const f of fields as Record<string, unknown>[]) {
    if (!f || typeof f !== 'object' || typeof f.label !== 'string') continue // reported below
    const label = f.label
    if (f.id !== undefined && !Number.isInteger(f.id)) return `"${label}" has an invalid id`
    if (f.required != null && typeof f.required !== 'boolean') return `"${label}" required must be true or false`
    for (const key of ['options', 'description', 'pattern'] as const) {
      if (f[key] != null && typeof f[key] !== 'string') return `"${label}" ${key} must be a string`
    }
    for (const key of ['min_value', 'max_value'] as const) {
      if (f[key] != null && !Number.isFinite(f[key])) return `"${label}" ${key} must be a number`
    }
  }

  for (const f of fields as FormFieldInput[]) {
    if (!f || typeof f.label !== 'string' || !f.label.trim()) return 'Every field needs a label'
    if (!FIELD_TYPES.includes(f.field_type)) return `Invalid field_type: ${f.field_type}`
    if (f.field_type === 'section') continue

    if (CHOICE_FIELD_TYPES.includes(f.field_type) && (!f.options || !f.options.trim())) {
      return `"${f.label}" needs at least one option`
    }

    if (f.field_type === 'linear_scale') {
      if (f.min_value == null || f.max_value == null) return `"${f.label}" needs a min and max value`
      if (f.min_value >= f.max_value) return `"${f.label}"'s min value must be less than its max value`
    }

    if (f.min_value != null && f.max_value != null && f.min_value > f.max_value) {
      return `"${f.label}"'s min value can't exceed its max value`
    }

    if (f.pattern) {
      try {
        new RegExp(f.pattern)
      } catch {
        return `"${f.label}" has an invalid pattern`
      }
    }
  }
  return null
}
