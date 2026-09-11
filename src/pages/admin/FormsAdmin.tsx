import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import AdminModal from '../../components/admin/AdminModal'
import FormPreviewModal from '../../components/admin/FormPreviewModal'
import { useAutosizeTextarea } from '../../lib/autosize'
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

// A prompt or its help text can run long — cramming them into the same
// fixed-width grid column as "Type" or "Options" made long text hard to see
// (an <input> never wraps, so it just scrolls out of view). This gives them
// their own full-width row instead, as a textarea that grows with the
// content and shrinks back down when it's short again.
function AutoGrowField({
  label,
  value,
  onChange,
  required,
  autoFocus,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  autoFocus?: boolean
  placeholder?: string
}) {
  const ref = useAutosizeTextarea(value)
  return (
    <label className="field field-row-fullwidth">
      <span className="mini-label">{label}</span>
      <textarea
        ref={ref}
        rows={1}
        required={required}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

// Collapsed, one-line summary of a field — click it (or the chevron) to
// expand for editing. Mirrors Google Forms: a question reads as a single
// row until you need to touch it, so a 10-field form doesn't read as a wall
// of inputs.
function FieldRowSummary({
  field,
  typeLabel,
  expanded,
  onToggle,
  onRemove,
  onDragHandlePointerDown,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: {
  field: FormFieldInput
  typeLabel: string
  expanded: boolean
  onToggle: () => void
  onRemove: () => void
  onDragHandlePointerDown: (e: React.DragEvent) => void
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  return (
    <div
      className="field-row-summary"
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle()
        }
      }}
    >
      <span
        className="drag-handle"
        role="presentation"
        aria-hidden="true"
        draggable
        onDragStart={onDragHandlePointerDown}
        onClick={(e) => e.stopPropagation()}
        title="Drag to reorder"
      >
        ⠿
      </span>
      <span className="field-row-summary-label">
        {field.label.trim() || <span className="field-row-summary-placeholder">Untitled question</span>}
        {field.required && field.field_type !== 'section' && <span className="req"> *</span>}
      </span>
      <span className="field-row-type-badge">{typeLabel}</span>
      <span className="field-row-reorder-btns">
        <button
          type="button"
          className="field-reorder-btn"
          aria-label="Move field up"
          disabled={!canMoveUp}
          onClick={(e) => {
            e.stopPropagation()
            onMoveUp()
          }}
        >
          ▲
        </button>
        <button
          type="button"
          className="field-reorder-btn"
          aria-label="Move field down"
          disabled={!canMoveDown}
          onClick={(e) => {
            e.stopPropagation()
            onMoveDown()
          }}
        >
          ▼
        </button>
      </span>
      <span className="field-row-chevron" aria-hidden="true">
        {expanded ? '▾' : '▸'}
      </span>
      <button
        type="button"
        className="rm-field"
        aria-label="Remove field"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
      >
        &times;
      </button>
    </div>
  )
}

function FieldRow({
  field,
  expanded,
  onToggleExpand,
  onChange,
  onRemove,
  dragProps,
}: {
  field: FormFieldInput
  expanded: boolean
  onToggleExpand: () => void
  onChange: (f: FormFieldInput) => void
  onRemove: () => void
  dragProps: {
    isDragging: boolean
    isDropTarget: boolean
    onDragHandlePointerDown: (e: React.DragEvent) => void
    onDragOver: (e: React.DragEvent) => void
    onDragLeave: () => void
    onDrop: (e: React.DragEvent) => void
    onDragEnd: () => void
    canMoveUp: boolean
    canMoveDown: boolean
    onMoveUp: () => void
    onMoveDown: () => void
  }
}) {
  const typeLabel = FIELD_TYPE_LABELS[field.field_type]
  const rowClass = [dragProps.isDragging && 'dragging', dragProps.isDropTarget && 'drop-target'].filter(Boolean).join(' ')

  if (field.field_type === 'section') {
    return (
      <div
        className={`field-row field-row-section${expanded ? ' expanded' : ''}${rowClass ? ` ${rowClass}` : ''}`}
        onDragOver={dragProps.onDragOver}
        onDragLeave={dragProps.onDragLeave}
        onDrop={dragProps.onDrop}
        onDragEnd={dragProps.onDragEnd}
      >
        <FieldRowSummary
          field={field}
          typeLabel={typeLabel}
          expanded={expanded}
          onToggle={onToggleExpand}
          onRemove={onRemove}
          onDragHandlePointerDown={dragProps.onDragHandlePointerDown}
          canMoveUp={dragProps.canMoveUp}
          canMoveDown={dragProps.canMoveDown}
          onMoveUp={dragProps.onMoveUp}
          onMoveDown={dragProps.onMoveDown}
        />
        {expanded && (
          <>
            <AutoGrowField
              label="Section title"
              value={field.label}
              onChange={(v) => onChange({ ...field, label: v })}
              required
              autoFocus
            />
            <AutoGrowField
              label="Description"
              value={field.description ?? ''}
              onChange={(v) => onChange({ ...field, description: v || null })}
            />
            <div className="field-row-grid">
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
          </>
        )}
      </div>
    )
  }

  const isChoice = CHOICE_TYPES.includes(field.field_type)
  const isRange = RANGE_TYPES.includes(field.field_type)
  const isLength = LENGTH_TYPES.includes(field.field_type)
  const isPattern = PATTERN_TYPES.includes(field.field_type)

  return (
    <div
      className={`field-row${expanded ? ' expanded' : ''}${rowClass ? ` ${rowClass}` : ''}`}
      onDragOver={dragProps.onDragOver}
      onDragLeave={dragProps.onDragLeave}
      onDrop={dragProps.onDrop}
      onDragEnd={dragProps.onDragEnd}
    >
      <FieldRowSummary
        field={field}
        typeLabel={typeLabel}
        expanded={expanded}
        onToggle={onToggleExpand}
        onRemove={onRemove}
        onDragHandlePointerDown={dragProps.onDragHandlePointerDown}
        canMoveUp={dragProps.canMoveUp}
        canMoveDown={dragProps.canMoveDown}
        onMoveUp={dragProps.onMoveUp}
        onMoveDown={dragProps.onMoveDown}
      />
      {expanded && (
        <>
          <AutoGrowField
            label="Label"
            value={field.label}
            onChange={(v) => onChange({ ...field, label: v })}
            required
            autoFocus
          />
          <AutoGrowField
            label="Help text"
            value={field.description ?? ''}
            onChange={(v) => onChange({ ...field, description: v || null })}
            placeholder="Shown under the label"
          />
          <div className="field-row-grid">
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
        </>
      )}
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
  // Only one field card is expanded at a time (Google Forms-style) — index
  // into draft.fields, or null when every card is collapsed.
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0)
  // Drag-and-drop reordering: which field is being dragged, and which slot
  // it's currently hovering over (for the drop-target highlight). Up/down
  // buttons cover the same "move" action for anyone not using a mouse.
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

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
    setExpandedIndex(0)
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
      setExpandedIndex(null)
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
    setExpandedIndex((cur) => (cur === null ? null : index < cur ? cur - 1 : index === cur ? null : cur))
  }

  // Moves the field at `from` to sit at `to`, shifting everything between —
  // shared by drag-and-drop and the up/down buttons. Keeps whichever field
  // was expanded still expanded at its new position.
  function moveField(from: number, to: number) {
    if (from === to || to < 0 || to >= draft.fields.length) return
    const fields = [...draft.fields]
    const [moved] = fields.splice(from, 1)
    fields.splice(to, 0, moved)
    setDraft({ ...draft, fields })
    setExpandedIndex((cur) => {
      if (cur === null) return null
      if (cur === from) return to
      if (from < cur && to >= cur) return cur - 1
      if (from > cur && to <= cur) return cur + 1
      return cur
    })
  }

  function addField() {
    const fields = [...draft.fields, newField()]
    setDraft({ ...draft, fields })
    setExpandedIndex(fields.length - 1)
  }

  function addSection() {
    const fields = [...draft.fields, { ...newField(), field_type: 'section' as const }]
    setDraft({ ...draft, fields })
    setExpandedIndex(fields.length - 1)
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
              <span><span className="req">*</span> Form name</span>
              <input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>

            <div className="field-rows">
              {draft.fields.map((field, i) => (
                <FieldRow
                  key={field.id}
                  field={field}
                  expanded={expandedIndex === i}
                  onToggleExpand={() => setExpandedIndex((cur) => (cur === i ? null : i))}
                  onChange={(next) => updateField(i, next)}
                  onRemove={() => removeField(i)}
                  dragProps={{
                    isDragging: dragIndex === i,
                    isDropTarget: dropIndex === i && dragIndex !== null && dragIndex !== i,
                    onDragHandlePointerDown: (e) => {
                      setDragIndex(i)
                      e.dataTransfer.effectAllowed = 'move'
                    },
                    onDragOver: (e) => {
                      if (dragIndex === null) return
                      e.preventDefault()
                      setDropIndex(i)
                    },
                    onDragLeave: () => setDropIndex((cur) => (cur === i ? null : cur)),
                    onDrop: (e) => {
                      e.preventDefault()
                      if (dragIndex !== null) moveField(dragIndex, i)
                      setDragIndex(null)
                      setDropIndex(null)
                    },
                    onDragEnd: () => {
                      setDragIndex(null)
                      setDropIndex(null)
                    },
                    canMoveUp: i > 0,
                    canMoveDown: i < draft.fields.length - 1,
                    onMoveUp: () => moveField(i, i - 1),
                    onMoveDown: () => moveField(i, i + 1),
                  }}
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
