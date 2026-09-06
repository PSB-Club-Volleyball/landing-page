import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import AdminModal from '../../components/admin/AdminModal'
import FormPreviewModal from '../../components/admin/FormPreviewModal'
import type { FieldType, FormFieldInput, FormTemplate } from '../../types'

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Short text',
  textarea: 'Long text',
  select: 'Dropdown',
  radio: 'Multiple choice',
  checkbox_group: 'Checkboxes',
  number: 'Number',
  checkbox: 'Checkbox',
  date: 'Date',
  time: 'Time',
  email: 'Email',
  phone: 'Phone',
  linear_scale: 'Linear scale',
  section: 'Section break',
}

const CHOICE_TYPES: FieldType[] = ['select', 'radio', 'checkbox_group']
const RANGE_TYPES: FieldType[] = ['number', 'linear_scale']
const LENGTH_TYPES: FieldType[] = ['text', 'textarea']
const PATTERN_TYPES: FieldType[] = ['text', 'email', 'phone']

let tempId = -1
function newField(): FormFieldInput {
  return {
    id: tempId--,
    label: '',
    field_type: 'text',
    options: null,
    required: false,
    sort_order: 0,
    description: null,
    min_value: null,
    max_value: null,
    pattern: null,
  }
}

interface Draft {
  name: string
  fields: FormFieldInput[]
  max_responses: string
  confirmation_message: string
}

function emptyDraft(): Draft {
  return { name: '', fields: [newField()], max_responses: '', confirmation_message: '' }
}

function FieldRowHead({
  index,
  typeLabel,
  onRemove,
}: {
  index: number
  typeLabel: string
  onRemove: () => void
}) {
  return (
    <div className="field-row-head">
      <span className="field-row-number">Field {index + 1}</span>
      <span className="field-row-type-badge">{typeLabel}</span>
      <button className="rm-field" type="button" aria-label="Remove field" onClick={onRemove}>
        &times;
      </button>
    </div>
  )
}

function FieldRow({
  field,
  index,
  onChange,
  onRemove,
}: {
  field: FormFieldInput
  index: number
  onChange: (f: FormFieldInput) => void
  onRemove: () => void
}) {
  if (field.field_type === 'section') {
    return (
      <div className="field-row field-row-section">
        <FieldRowHead index={index} typeLabel={FIELD_TYPE_LABELS[field.field_type]} onRemove={onRemove} />
        <div className="field-row-grid">
          <label className="field">
            <span className="mini-label">Section title</span>
            <input value={field.label} onChange={(e) => onChange({ ...field, label: e.target.value })} required />
          </label>
          <label className="field">
            <span className="mini-label">Description</span>
            <input
              value={field.description ?? ''}
              onChange={(e) => onChange({ ...field, description: e.target.value || null })}
            />
          </label>
          <label className="field">
            <span className="mini-label">Type</span>
            <select
              value={field.field_type}
              onChange={(e) => onChange({ ...field, field_type: e.target.value as FieldType })}
            >
              {Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    )
  }

  const isChoice = CHOICE_TYPES.includes(field.field_type)
  const isRange = RANGE_TYPES.includes(field.field_type)
  const isLength = LENGTH_TYPES.includes(field.field_type)
  const isPattern = PATTERN_TYPES.includes(field.field_type)

  return (
    <div className="field-row">
      <FieldRowHead index={index} typeLabel={FIELD_TYPE_LABELS[field.field_type]} onRemove={onRemove} />
      <div className="field-row-grid">
        <label className="field field-row-label">
          <span className="mini-label">Label</span>
          <input value={field.label} onChange={(e) => onChange({ ...field, label: e.target.value })} required />
        </label>
        <label className="field">
          <span className="mini-label">Type</span>
          <select
            value={field.field_type}
            onChange={(e) => onChange({ ...field, field_type: e.target.value as FieldType })}
          >
            {Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="mini-label">Help text</span>
          <input
            value={field.description ?? ''}
            placeholder="Shown under the label"
            onChange={(e) => onChange({ ...field, description: e.target.value || null })}
          />
        </label>
        <label className="field">
          <span className="mini-label">Options {isChoice && <span className="field-hint">(separate with |)</span>}</span>
          <input
            value={field.options ?? ''}
            placeholder={isChoice ? 'S | M | L | XL' : '—'}
            disabled={!isChoice}
            onChange={(e) => onChange({ ...field, options: e.target.value })}
          />
        </label>
        {(isRange || isLength) && (
          <>
            <label className="field">
              <span className="mini-label">{isRange ? 'Min value' : 'Min length'}</span>
              <input
                type="number"
                value={field.min_value ?? ''}
                onChange={(e) => onChange({ ...field, min_value: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span className="mini-label">{isRange ? 'Max value' : 'Max length'}</span>
              <input
                type="number"
                value={field.max_value ?? ''}
                onChange={(e) => onChange({ ...field, max_value: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </label>
          </>
        )}
        {isPattern && (
          <label className="field">
            <span className="mini-label">Pattern <span className="field-hint">(regex, optional)</span></span>
            <input
              value={field.pattern ?? ''}
              placeholder="e.g. ^\\d{10}$"
              onChange={(e) => onChange({ ...field, pattern: e.target.value || null })}
            />
          </label>
        )}
      </div>
      <label className="req-toggle">
        <input
          type="checkbox"
          checked={field.required}
          onChange={(e) => onChange({ ...field, required: e.target.checked })}
        />
        Required
      </label>
    </div>
  )
}

function FormsAdmin({ isOwner }: { isOwner: boolean }) {
  const [forms, setForms] = useState<FormTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [previewing, setPreviewing] = useState(false)

  function refresh() {
    setLoading(true)
    adminApi.forms
      .list()
      .then((res) => setForms(res.forms))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  function closeBuilder() {
    setEditingId(null)
    setPreviewing(false)
  }

  function startCreate() {
    setDraft(emptyDraft())
    setPreviewing(false)
    setEditingId('new')
  }

  async function startEdit(id: number) {
    setError(null)
    try {
      const { form } = await adminApi.forms.get(id)
      setDraft({
        name: form.name,
        fields: form.fields.map((f) => ({ ...f })),
        max_responses: form.max_responses !== null ? String(form.max_responses) : '',
        confirmation_message: form.confirmation_message ?? '',
      })
      setPreviewing(false)
      setEditingId(id)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function updateField(index: number, next: FormFieldInput) {
    const fields = [...draft.fields]
    fields[index] = next
    setDraft({ ...draft, fields })
  }

  function removeField(index: number) {
    setDraft({ ...draft, fields: draft.fields.filter((_, i) => i !== index) })
  }

  function addField() {
    setDraft({ ...draft, fields: [...draft.fields, newField()] })
  }

  function addSection() {
    setDraft({ ...draft, fields: [...draft.fields, { ...newField(), field_type: 'section' }] })
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const payload = {
      name: draft.name,
      fields: draft.fields.map((f, i) => ({
        ...f,
        id: f.id !== undefined && f.id > 0 ? f.id : undefined,
        sort_order: i,
      })),
      max_responses: draft.max_responses ? Number(draft.max_responses) : null,
      confirmation_message: draft.confirmation_message || null,
    }
    try {
      if (editingId === 'new') {
        await adminApi.forms.create(payload)
      } else if (editingId !== null) {
        await adminApi.forms.update(editingId, payload)
      }
      closeBuilder()
      refresh()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this form? Events using it will need a new one.')) return
    try {
      await adminApi.forms.remove(id)
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <>
      <div className="admin-main-head">
        <h2>Forms</h2>
        <button className="add-btn" type="button" onClick={startCreate}>
          + New form
        </button>
      </div>
      <p className="admin-note">Build a form once, then attach it to any event from the Events tab.</p>
      {error && <p className="admin-error">{error}</p>}

      {editingId !== null && (
        <AdminModal title={editingId === 'new' ? 'New form' : 'Edit form'} onClose={closeBuilder} wide>
          <form className="builder-card" onSubmit={handleSave}>
            <label className="field">
              Form name <span className="req">*</span>
              <input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>

            <div className="field-rows">
              {draft.fields.map((field, i) => (
                <FieldRow
                  key={field.id}
                  field={field}
                  index={i}
                  onChange={(next) => updateField(i, next)}
                  onRemove={() => removeField(i)}
                />
              ))}
            </div>

            <div className="form-actions form-actions-start">
              <button className="add-field-btn" type="button" onClick={addField}>
                + Add field
              </button>
              <button className="add-field-btn" type="button" onClick={addSection}>
                + Add section break
              </button>
            </div>

            <fieldset className="signup-fieldset">
              <legend>Responses</legend>
              <div className="grid2">
                <label className="field">
                  Response limit <span className="field-hint">(optional &mdash; total across all events using this form)</span>
                  <input
                    type="number"
                    min="1"
                    value={draft.max_responses}
                    onChange={(e) => setDraft({ ...draft, max_responses: e.target.value })}
                  />
                </label>
                <label className="field">
                  Confirmation message <span className="field-hint">(optional &mdash; shown after submit)</span>
                  <input
                    value={draft.confirmation_message}
                    placeholder="Default: “You’re in!”"
                    onChange={(e) => setDraft({ ...draft, confirmation_message: e.target.value })}
                  />
                </label>
              </div>
            </fieldset>

            <div className="form-actions">
              <button className="btn btn-outline" type="button" onClick={() => setPreviewing(true)}>
                Preview
              </button>
              <span className="form-actions-spacer" />
              <button className="btn btn-outline" type="button" onClick={closeBuilder}>
                Cancel
              </button>
              <button className="btn btn-ace" type="submit">
                Save form
              </button>
            </div>
          </form>
        </AdminModal>
      )}
      {editingId !== null && previewing && (
        <FormPreviewModal
          name={draft.name}
          fields={draft.fields.map((f, i) => ({ ...f, id: f.id ?? -(i + 1) }))}
          confirmationMessage={draft.confirmation_message}
          onClose={() => setPreviewing(false)}
        />
      )}

      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>Form</th>
              <th>Fields</th>
              <th>Used on</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4}>Loading&hellip;</td>
              </tr>
            )}
            {!loading && forms.length === 0 && (
              <tr>
                <td colSpan={4}>No forms yet.</td>
              </tr>
            )}
            {forms.map((f) => (
              <tr key={f.id}>
                <td>{f.name}</td>
                <td>{f.field_count}</td>
                <td>
                  {f.used_count} event{f.used_count === 1 ? '' : 's'}
                </td>
                <td>
                  <span className="row-actions">
                    <button type="button" onClick={() => startEdit(f.id)}>
                      Edit
                    </button>
                    {isOwner && (
                      <button type="button" className="danger" onClick={() => handleDelete(f.id)}>
                        Delete
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

export default FormsAdmin
