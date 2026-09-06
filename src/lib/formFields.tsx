import { useAutosizeTextarea } from './autosize'
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

function toggleInList(current: string, option: string): string {
  const items = current ? current.split('|') : []
  const next = items.includes(option) ? items.filter((i) => i !== option) : [...items, option]
  return next.join('|')
}

export function FieldInput({
  field,
  value,
  onChange,
}: {
  field: PreviewableField
  value: string
  onChange: (v: string) => void
}) {
  const commonProps = {
    id: `field-${field.id}`,
    required: field.required,
    value,
  }
  const textareaRef = useAutosizeTextarea(value)

  if (field.field_type === 'textarea') {
    return (
      <textarea
        {...commonProps}
        ref={textareaRef}
        rows={1}
        minLength={field.min_value ?? undefined}
        maxLength={field.max_value ?? undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  if (field.field_type === 'select') {
    const options = (field.options ?? '').split('|').map((o) => o.trim()).filter(Boolean)
    return (
      <select {...commonProps} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          Choose one
        </option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    )
  }

  if (field.field_type === 'radio') {
    const options = (field.options ?? '').split('|').map((o) => o.trim()).filter(Boolean)
    return (
      <div className="choice-group" role="radiogroup">
        {options.map((opt) => (
          <label key={opt} className="choice-option">
            <input
              type="radio"
              name={commonProps.id}
              required={field.required}
              checked={value === opt}
              onChange={() => onChange(opt)}
            />
            {opt}
          </label>
        ))}
      </div>
    )
  }

  if (field.field_type === 'checkbox_group') {
    const options = (field.options ?? '').split('|').map((o) => o.trim()).filter(Boolean)
    const selected = value ? value.split('|') : []
    return (
      <div className="choice-group">
        {options.map((opt) => (
          <label key={opt} className="choice-option">
            <input type="checkbox" checked={selected.includes(opt)} onChange={() => onChange(toggleInList(value, opt))} />
            {opt}
          </label>
        ))}
      </div>
    )
  }

  if (field.field_type === 'checkbox') {
    return (
      <input
        id={commonProps.id}
        type="checkbox"
        checked={value === 'yes'}
        onChange={(e) => onChange(e.target.checked ? 'yes' : '')}
      />
    )
  }

  if (field.field_type === 'linear_scale') {
    const min = field.min_value ?? 1
    const max = field.max_value ?? 5
    const scale = Array.from({ length: max - min + 1 }, (_, i) => min + i)
    return (
      <div className="scale-group" role="radiogroup">
        <span className="scale-end">{min}</span>
        {scale.map((n) => (
          <label key={n} className="scale-option">
            <input
              type="radio"
              name={commonProps.id}
              required={field.required}
              checked={value === String(n)}
              onChange={() => onChange(String(n))}
            />
            {n}
          </label>
        ))}
        <span className="scale-end">{max}</span>
      </div>
    )
  }

  const inputType =
    field.field_type === 'number'
      ? 'number'
      : field.field_type === 'date'
        ? 'date'
        : field.field_type === 'time'
          ? 'time'
          : field.field_type === 'email'
            ? 'email'
            : field.field_type === 'phone'
              ? 'tel'
              : 'text'

  return (
    <input
      {...commonProps}
      type={inputType}
      min={field.field_type === 'number' ? (field.min_value ?? undefined) : undefined}
      max={field.field_type === 'number' ? (field.max_value ?? undefined) : undefined}
      minLength={field.field_type === 'text' ? (field.min_value ?? undefined) : undefined}
      maxLength={field.field_type === 'text' ? (field.max_value ?? undefined) : undefined}
      pattern={field.pattern ?? undefined}
      onChange={(e) => onChange(e.target.value)}
    />
  )
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
