import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../lib/adminApi'
import AdminModal from '../../components/admin/AdminModal'
import BulkActionBar from '../../components/admin/BulkActionBar'
import { runBulk, summarizeBulk } from '../../lib/bulk'
import { useSelection } from '../../lib/useSelection'
import { emptyDraft, eventToDraft, shiftDateTime, toInput, VISIBILITY_LABELS, type Draft } from './eventDraft'
import { EventFormFields } from './eventForm'
import type { AdminEventRow, EventStatus, FormTemplate } from '../../types'

// Bulk-editing several events at once can only ever set every selected
// event to the *same* value for a field, so per-event data (title, date/time,
// recurrence) is excluded entirely rather than offered and silently
// clobbered. Every includable field is opt-in via its own checkbox — left
// unchecked (and greyed out), it's simply not part of the update.
interface BulkDraft {
  apply: {
    event_type: boolean
    description: boolean
    tags: boolean
    location: boolean
    status: boolean
    signup: boolean
  }
  event_type: string
  description: string
  tags: string
  location_name: string
  location_address: string
  status: EventStatus
  signup_enabled: boolean
  rsvp_gated: boolean
  form_id: string
  capacity: string
}

function emptyBulkDraft(): BulkDraft {
  return {
    apply: { event_type: false, description: false, tags: false, location: false, status: false, signup: false },
    event_type: 'practice',
    description: '',
    tags: '',
    location_name: '',
    location_address: '',
    status: 'published',
    signup_enabled: false,
    rsvp_gated: false,
    form_id: '',
    capacity: '',
  }
}

function bulkDraftToInput(draft: BulkDraft) {
  const input: Partial<AdminEventRow> = {}
  if (draft.apply.event_type) input.event_type = draft.event_type
  if (draft.apply.description) input.description = draft.description || null
  if (draft.apply.tags) {
    input.tags =
      draft.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .join(', ') || null
  }
  if (draft.apply.location) {
    input.location_name = draft.location_name || null
    input.location_address = draft.location_address || null
  }
  if (draft.apply.status) input.status = draft.status
  if (draft.apply.signup) {
    input.signup_enabled = draft.signup_enabled
    input.rsvp_gated = draft.signup_enabled && draft.rsvp_gated
    input.form_id = draft.signup_enabled && draft.form_id ? Number(draft.form_id) : null
    input.capacity = draft.signup_enabled && draft.capacity ? Number(draft.capacity) : null
  }
  return input
}

function BulkEditForm({
  draft,
  onChange,
  forms,
  count,
  busy,
  onCancel,
  onApply,
  onShift,
  shiftDays,
  onShiftDaysChange,
  onDelete,
  canDelete,
}: {
  draft: BulkDraft
  onChange: (d: BulkDraft) => void
  forms: FormTemplate[]
  count: number
  busy: boolean
  onCancel: () => void
  onApply: () => void
  onShift: () => void
  shiftDays: string
  onShiftDaysChange: (v: string) => void
  onDelete: () => void
  canDelete: boolean
}) {
  const anyChecked = Object.values(draft.apply).some(Boolean)
  return (
    <div className="event-form">
      <fieldset>
        <legend>Can&rsquo;t be batch-edited</legend>
        <div className="grid2">
          <label className="field bulk-field-disabled">
            Title
            <input disabled value="(edit events individually)" readOnly />
          </label>
          <label className="field bulk-field-disabled">
            Date &amp; time
            <input disabled value="(edit events individually)" readOnly />
          </label>
        </div>
        <div className="bulk-shift-row">
          <label className="field">
            Shift all selected by <span className="field-hint">(days, +/-)</span>
            <input
              type="number"
              placeholder="e.g. 7 or -1"
              value={shiftDays}
              onChange={(e) => onShiftDaysChange(e.target.value)}
            />
          </label>
          <button className="btn btn-outline" type="button" disabled={busy || !shiftDays} onClick={onShift}>
            Reschedule {count} event{count === 1 ? '' : 's'}
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>Fields to change</legend>

        <label className="bulk-check-row">
          <input
            type="checkbox"
            checked={draft.apply.event_type}
            onChange={(e) => onChange({ ...draft, apply: { ...draft.apply, event_type: e.target.checked } })}
          />
          <span className="field bulk-check-field">
            Type
            <select
              disabled={!draft.apply.event_type}
              value={draft.event_type}
              onChange={(e) => onChange({ ...draft, event_type: e.target.value })}
            >
              <option value="practice">Practice</option>
              <option value="tournament">Tournament</option>
              <option value="open_gym">Open gym</option>
              <option value="game">Game</option>
              <option value="social">Social</option>
            </select>
          </span>
        </label>

        <label className="bulk-check-row">
          <input
            type="checkbox"
            checked={draft.apply.status}
            onChange={(e) => onChange({ ...draft, apply: { ...draft.apply, status: e.target.checked } })}
          />
          <span className="field bulk-check-field">
            Status
            <select
              disabled={!draft.apply.status}
              value={draft.status}
              onChange={(e) => onChange({ ...draft, status: e.target.value as EventStatus })}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </span>
        </label>

        <label className="bulk-check-row">
          <input
            type="checkbox"
            checked={draft.apply.tags}
            onChange={(e) => onChange({ ...draft, apply: { ...draft.apply, tags: e.target.checked } })}
          />
          <span className="field bulk-check-field">
            Tags <span className="field-hint">(comma-separated &mdash; replaces existing tags)</span>
            <input
              disabled={!draft.apply.tags}
              value={draft.tags}
              onChange={(e) => onChange({ ...draft, tags: e.target.value })}
            />
          </span>
        </label>

        <label className="bulk-check-row">
          <input
            type="checkbox"
            checked={draft.apply.description}
            onChange={(e) => onChange({ ...draft, apply: { ...draft.apply, description: e.target.checked } })}
          />
          <span className="field bulk-check-field">
            Description
            <textarea
              rows={2}
              disabled={!draft.apply.description}
              value={draft.description}
              onChange={(e) => onChange({ ...draft, description: e.target.value })}
            />
          </span>
        </label>

        <label className="bulk-check-row">
          <input
            type="checkbox"
            checked={draft.apply.location}
            onChange={(e) => onChange({ ...draft, apply: { ...draft.apply, location: e.target.checked } })}
          />
          <span className="field bulk-check-field">
            Location &amp; address
            <div className="grid2">
              <input
                disabled={!draft.apply.location}
                placeholder="Location name"
                value={draft.location_name}
                onChange={(e) => onChange({ ...draft, location_name: e.target.value })}
              />
              <input
                disabled={!draft.apply.location}
                placeholder="Address"
                value={draft.location_address}
                onChange={(e) => onChange({ ...draft, location_address: e.target.value })}
              />
            </div>
          </span>
        </label>

        <label className="bulk-check-row">
          <input
            type="checkbox"
            checked={draft.apply.signup}
            onChange={(e) => onChange({ ...draft, apply: { ...draft.apply, signup: e.target.checked } })}
          />
          <span className="field bulk-check-field">
            Signup settings
            <label className="switch-row">
              <input
                type="checkbox"
                disabled={!draft.apply.signup}
                checked={draft.signup_enabled}
                onChange={(e) => onChange({ ...draft, signup_enabled: e.target.checked })}
              />
              Enable RSVP / signup
            </label>
            {draft.signup_enabled && (
              <>
                <label className="switch-row">
                  <input
                    type="checkbox"
                    disabled={!draft.apply.signup}
                    checked={draft.rsvp_gated}
                    onChange={(e) => onChange({ ...draft, rsvp_gated: e.target.checked })}
                  />
                  Require admin approval
                </label>
                <div className="grid2">
                  <select
                    disabled={!draft.apply.signup}
                    value={draft.form_id}
                    onChange={(e) => onChange({ ...draft, form_id: e.target.value })}
                  >
                    <option value="">No form &mdash; just name &amp; email</option>
                    {forms.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    disabled={!draft.apply.signup}
                    placeholder="Capacity (optional)"
                    value={draft.capacity}
                    onChange={(e) => onChange({ ...draft, capacity: e.target.value })}
                  />
                </div>
              </>
            )}
          </span>
        </label>
      </fieldset>

      <div className="form-actions">
        {canDelete && (
          <button className="btn btn-outline danger" type="button" disabled={busy} onClick={onDelete}>
            Delete {count} event{count === 1 ? '' : 's'}
          </button>
        )}
        <span className="form-actions-spacer" />
        <button className="btn btn-outline" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-ace" type="button" disabled={busy || !anyChecked} onClick={onApply}>
          Apply to {count} event{count === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  )
}

function EventsAdmin({ isOwner }: { isOwner: boolean }) {
  const navigate = useNavigate()
  const [events, setEvents] = useState<AdminEventRow[]>([])
  const [forms, setForms] = useState<FormTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createDraft, setCreateDraft] = useState<Draft>(emptyDraft)
  const selection = useSelection()
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [bulkDraft, setBulkDraft] = useState<BulkDraft>(emptyBulkDraft)
  const [bulkShiftDays, setBulkShiftDays] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  // Address/recurrence/tags are behind one disclosure toggle so the common
  // case (title, type, when/where, description, signup) reads as a short
  // form, Google-Forms-style, instead of every field up front.
  const [showMoreOptions, setShowMoreOptions] = useState(false)
  // Past events clutter the table once a club has run a season of them, so
  // they're hidden by default — same philosophy as the public events page.
  const [showPast, setShowPast] = useState(false)

  function refresh() {
    setLoading(true)
    adminApi.events
      .list()
      .then((res) => setEvents(res.events))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])
  useEffect(() => {
    adminApi.forms.list().then((res) => setForms(res.forms)).catch(() => {})
  }, [])

  async function runSelectedBulk(verb: string, fn: (ev: AdminEventRow) => Promise<unknown>) {
    const targets = events.filter((e) => selection.isSelected(e.id))
    setBulkBusy(true)
    const result = await runBulk(targets, fn)
    setError(summarizeBulk(result, verb))
    selection.clear()
    refresh()
    setBulkBusy(false)
  }

  const applyBulkShift = () => {
    const days = Number(bulkShiftDays)
    if (!Number.isFinite(days) || days === 0) return
    return runSelectedBulk('Bulk reschedule', (ev) =>
      adminApi.events.update(ev.id, {
        start_time: shiftDateTime(ev.start_time, days),
        end_time: ev.end_time ? shiftDateTime(ev.end_time, days) : null,
      })
    ).then(() => setBulkShiftDays(''))
  }

  const applyBulkEdit = () => {
    const input = bulkDraftToInput(bulkDraft)
    return runSelectedBulk('Bulk update', (ev) => adminApi.events.update(ev.id, input)).then(() => {
      setBulkEditOpen(false)
      setBulkDraft(emptyBulkDraft())
    })
  }

  const applyBulkDelete = () => {
    if (!confirm(`Delete ${selection.selected.size} event(s)? This can't be undone.`)) return
    return runSelectedBulk('Bulk delete', (ev) => adminApi.events.remove(ev.id)).then(() => setBulkEditOpen(false))
  }

  function startDuplicate(ev: AdminEventRow) {
    setCreateDraft({ ...eventToDraft(ev), start_time: '', end_time: '', status: 'draft' })
    setShowMoreOptions(false)
    setCreating(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    try {
      await adminApi.events.create(toInput(createDraft))
      setCreating(false)
      setCreateDraft(emptyDraft)
      refresh()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Remove this event?')) return
    try {
      await adminApi.events.remove(id)
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleToggleReleaseEarly(ev: AdminEventRow) {
    try {
      await adminApi.events.update(ev.id, { released_early: !ev.released_early })
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const seriesCounts = new Map<number, number>()
  for (const ev of events) {
    if (ev.series_id) seriesCounts.set(ev.series_id, (seriesCounts.get(ev.series_id) ?? 0) + 1)
  }

  const pastCount = events.filter((e) => e.is_past).length
  const visibleEvents = showPast ? events : events.filter((e) => !e.is_past)

  return (
    <>
      <div className="admin-main-head">
        <h2>Events</h2>
        <div className="admin-head-actions">
          {pastCount > 0 && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowPast((v) => !v)}>
              {showPast ? 'Hide past events' : `Show past events (${pastCount})`}
            </button>
          )}
          <button
            className="add-btn"
            type="button"
            onClick={() => {
              setShowMoreOptions(false)
              setCreating(true)
            }}
          >
            + Add event
          </button>
        </div>
      </div>
      {error && <p className="admin-error">{error}</p>}
      {creating && (
        <AdminModal title="New event" onClose={() => setCreating(false)} wide>
          <form className="event-form" onSubmit={handleCreate}>
            <EventFormFields
              draft={createDraft}
              onChange={setCreateDraft}
              forms={forms}
              showMoreOptions={showMoreOptions}
              onToggleMoreOptions={() => setShowMoreOptions((v) => !v)}
              includeRecurrence
            />
            <div className="form-actions">
              <button className="btn btn-outline" type="button" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button className="btn btn-ace" type="submit">
                Save event
              </button>
            </div>
          </form>
        </AdminModal>
      )}
      <BulkActionBar count={selection.selected.size} onClear={selection.clear}>
        <button type="button" disabled={bulkBusy} onClick={() => setBulkEditOpen(true)}>
          Edit selected&hellip;
        </button>
        {isOwner && (
          <button type="button" className="danger" disabled={bulkBusy} onClick={applyBulkDelete}>
            Delete selected
          </button>
        )}
      </BulkActionBar>
      {bulkEditOpen && (
        <AdminModal title={`Edit ${selection.selected.size} event${selection.selected.size === 1 ? '' : 's'}`} onClose={() => setBulkEditOpen(false)} wide>
          <BulkEditForm
            draft={bulkDraft}
            onChange={setBulkDraft}
            forms={forms}
            count={selection.selected.size}
            busy={bulkBusy}
            onCancel={() => setBulkEditOpen(false)}
            onApply={applyBulkEdit}
            onShift={applyBulkShift}
            shiftDays={bulkShiftDays}
            onShiftDaysChange={setBulkShiftDays}
            onDelete={applyBulkDelete}
            canDelete={isOwner}
          />
        </AdminModal>
      )}
      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th className="select-col">
                <input
                  type="checkbox"
                  checked={visibleEvents.length > 0 && visibleEvents.every((e) => selection.isSelected(e.id))}
                  onChange={() => selection.toggleAll(visibleEvents.map((e) => e.id))}
                />
              </th>
              <th>Title</th>
              <th>Type</th>
              <th>Starts</th>
              <th>Status</th>
              <th>Visibility</th>
              <th>Series</th>
              <th>Signups</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9}>Loading&hellip;</td>
              </tr>
            )}
            {!loading && events.length === 0 && (
              <tr>
                <td colSpan={9}>No events yet.</td>
              </tr>
            )}
            {!loading && events.length > 0 && visibleEvents.length === 0 && (
              <tr>
                <td colSpan={9}>All events are in the past. &ldquo;Show past events&rdquo; above to see them.</td>
              </tr>
            )}
            {visibleEvents.map((ev) => (
              <tr key={ev.id}>
                <td className="select-col">
                  <input type="checkbox" checked={selection.isSelected(ev.id)} onChange={() => selection.toggle(ev.id)} />
                </td>
                <td>
                  <button type="button" className="link-btn" onClick={() => navigate(`/admin/events/${ev.id}`)}>
                    {ev.title}
                  </button>
                </td>
                <td>{ev.event_type}</td>
                <td>{new Date(ev.start_time).toLocaleString()}</td>
                <td>
                  {ev.status !== 'cancelled' && ev.is_past ? (
                    <span className="status-chip status-completed">completed</span>
                  ) : (
                    <span className={`status-chip status-${ev.status}`}>{ev.status}</span>
                  )}
                </td>
                <td>
                  <span className={`status-chip visibility-${ev.visibility}`}>{VISIBILITY_LABELS[ev.visibility]}</span>
                </td>
                <td>
                  {ev.series_id ? (
                    <>
                      {`Series of ${seriesCounts.get(ev.series_id) ?? 1}`}
                      <br />
                      <button type="button" className="signups-toggle" onClick={() => handleToggleReleaseEarly(ev)}>
                        {ev.released_early ? 'Showing early · hide again' : 'Show now'}
                      </button>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {ev.signup_enabled ? (
                    <button
                      type="button"
                      className="signups-toggle"
                      onClick={() => navigate(`/admin/events/${ev.id}?tab=signups`)}
                    >
                      {ev.signup_count} &middot; {ev.form_name ?? 'name & email'}
                    </button>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <span className="row-actions">
                    <button type="button" onClick={() => navigate(`/admin/events/${ev.id}`)}>
                      Edit
                    </button>
                    <button type="button" className="dup-btn" onClick={() => startDuplicate(ev)}>
                      Duplicate
                    </button>
                    {isOwner && (
                      <button type="button" className="danger" onClick={() => handleDelete(ev.id)}>
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

export default EventsAdmin
