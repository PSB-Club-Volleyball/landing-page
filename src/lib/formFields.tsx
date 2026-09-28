import { useAutosizeTextarea } from './autosize'
import type { PreviewableField } from './formPages'

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
