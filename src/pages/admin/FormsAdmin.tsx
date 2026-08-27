import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import type { FieldType, FormFieldInput, FormTemplate } from '../../types'

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Short text',
  textarea: 'Long text',
  select: 'Single choice',
  number: 'Number',
  checkbox: 'Checkbox',
}

let tempId = -1
function newField(): FormFieldInput {
  return { id: tempId--, label: '', field_type: 'text', options: null, required: false, sort_order: 0 }
}

interface Draft {
  name: string
  fields: FormFieldInput[]
}

function emptyDraft(): Draft {
  return { name: '', fields: [newField()] }
}

function FieldRow({
  field,
  onChange,
  onRemove,
}: {
  field: FormFieldInput
  onChange: (f: FormFieldInput) => void
  onRemove: () => void
}) {
  return (
    <div className="field-row">
      <label className="field">
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
        <span className="mini-label">Options {field.field_type === 'select' && <span className="field-hint">(separate with |)</span>}</span>
        <input
          value={field.options ?? ''}
          placeholder={field.field_type === 'select' ? 'S | M | L | XL' : '—'}
          disabled={field.field_type !== 'select'}
          onChange={(e) => onChange({ ...field, options: e.target.value })}
        />
      </label>
      <label className="req-toggle">
        <input
          type="checkbox"
          checked={field.required}
          onChange={(e) => onChange({ ...field, required: e.target.checked })}
        />
        Required
      </label>
      <button className="rm-field" type="button" aria-label="Remove field" onClick={onRemove}>
        &times;
      </button>
    </div>
  )
}

function FormsAdmin({ isOwner }: { isOwner: boolean }) {
  const [forms, setForms] = useState<FormTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft())

  function refresh() {
    setLoading(true)
    adminApi.forms
      .list()
      .then((res) => setForms(res.forms))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  function startCreate() {
    setDraft(emptyDraft())
    setEditingId('new')
  }

  async function startEdit(id: number) {
    setError(null)
    try {
      const { form } = await adminApi.forms.get(id)
      setDraft({ name: form.name, fields: form.fields.map((f) => ({ ...f })) })
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
    }
    try {
      if (editingId === 'new') {
        await adminApi.forms.create(payload)
      } else if (editingId !== null) {
        await adminApi.forms.update(editingId, payload)
      }
      setEditingId(null)
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
                onChange={(next) => updateField(i, next)}
                onRemove={() => removeField(i)}
              />
            ))}
          </div>

          <button className="add-field-btn" type="button" onClick={addField}>
            + Add field
          </button>

          <div className="form-actions">
            <button className="btn btn-outline" type="button" onClick={() => setEditingId(null)}>
              Cancel
            </button>
            <button className="btn btn-ace" type="submit">
              Save form
            </button>
          </div>
        </form>
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
