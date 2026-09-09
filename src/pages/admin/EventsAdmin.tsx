import { Fragment, useEffect, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import AdminModal from '../../components/admin/AdminModal'
import BulkActionBar from '../../components/admin/BulkActionBar'
import { runBulk, summarizeBulk } from '../../lib/bulk'
import { downloadCsv, toCsv } from '../../lib/csv'
import { useSelection } from '../../lib/useSelection'
import { useAutosizeTextarea } from '../../lib/autosize'
import type { AdminEventRow, EventSignup, EventStatus, FormTemplate } from '../../types'

function exportSignupsCsv(eventTitle: string, signups: EventSignup[]) {
  const csv = toCsv(
    ['Name', 'Email', 'Answers', 'Status', 'Checked in', 'Submitted'],
    signups.map((s) => [
      s.name,
      s.email,
      s.answers ? Object.values(s.answers).filter(Boolean).join('; ') : '',
      s.status,
      s.checked_in_at ? new Date(s.checked_in_at).toLocaleString() : '',
      new Date(s.created_at).toLocaleString(),
    ])
  )
  const safeTitle = eventTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  downloadCsv(`${safeTitle || 'event'}-signups.csv`, csv)
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Shifts a "YYYY-MM-DDTHH:MM" wall-clock string by a number of calendar days
// (month/year rollover included), leaving the time-of-day untouched. Done in
// UTC purely as a trick to get correct calendar-date math without the local
// timezone nudging the date across midnight — the string itself never
// carries a timezone (see EventDateTimeFields above).
function shiftDateTime(dt: string, days: number): string {
  const [datePart, timePart] = dt.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d))
  utc.setUTCDate(utc.getUTCDate() + days)
  return `${utc.toISOString().slice(0, 10)}T${timePart ?? ''}`
}

const emptyDraft = {
  title: '',
  event_type: 'practice',
  start_time: '',
  end_time: '',
  location_name: '',
  location_address: '',
  status: 'draft' as EventStatus,
  description: '',
  recurrence_days: '' as string, // comma-separated weekday ints, e.g. "2,4,6"; empty = one-time
  recurrence_until: '',
  signup_enabled: false,
  rsvp_gated: false,
  form_id: '' as string, // '' = none chosen yet
  capacity: '' as string,
  tags: '' as string, // comma-separated
  signup_deadline: '' as string, // '' = no deadline, signup stays open until the event starts
}
type Draft = typeof emptyDraft

function toInput(draft: Draft) {
  return {
    title: draft.title,
    event_type: draft.event_type,
    start_time: draft.start_time,
    end_time: draft.end_time || null,
    location_name: draft.location_name || null,
    location_address: draft.location_address || null,
    status: draft.status,
    description: draft.description || null,
    recurrence_days: draft.recurrence_days || null,
    recurrence_until: draft.recurrence_days ? draft.recurrence_until || null : null,
    signup_enabled: draft.signup_enabled,
    rsvp_gated: draft.signup_enabled && draft.rsvp_gated,
    form_id: draft.signup_enabled && draft.form_id ? Number(draft.form_id) : null,
    capacity: draft.signup_enabled && draft.capacity ? Number(draft.capacity) : null,
    signup_deadline: draft.signup_enabled && draft.signup_deadline ? draft.signup_deadline : null,
    tags: draft.tags
      ? draft.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
          .join(', ') || null
      : null,
  }
}

function eventToDraft(e: AdminEventRow): Draft {
  return {
    title: e.title,
    event_type: e.event_type,
    start_time: e.start_time,
    end_time: e.end_time ?? '',
    location_name: e.location_name ?? '',
    location_address: e.location_address ?? '',
    status: e.status,
    description: e.description ?? '',
    // Recurrence is create-time only (see events.ts) — an existing row never carries it.
    recurrence_days: '',
    recurrence_until: '',
    signup_enabled: e.signup_enabled,
    rsvp_gated: e.rsvp_gated,
    form_id: e.form_id !== null ? String(e.form_id) : '',
    capacity: e.capacity !== null ? String(e.capacity) : '',
    tags: e.tags ?? '',
    signup_deadline: e.signup_deadline ?? '',
  }
}

// start_time/end_time stay stored as combined "YYYY-MM-DDTHH:MM" strings (see
// toInput/eventToDraft) — these just split/recombine them so the form can show
// one date plus separate start/end time inputs instead of two full datetimes.
function splitDateTime(dt: string): { date: string; time: string } {
  if (!dt) return { date: '', time: '' }
  const [date, time] = dt.split('T')
  return { date, time: time ?? '' }
}

function combineDateTime(date: string, time: string): string {
  return date || time ? `${date}T${time}` : ''
}

function EventDateTimeFields({ draft, onChange }: { draft: Draft; onChange: (draft: Draft) => void }) {
  const { date, time: startTime } = splitDateTime(draft.start_time)
  const { time: endTime } = splitDateTime(draft.end_time)

  return (
    <>
      <label className="field">
        <span><span className="req">*</span> Date</span>
        <input
          type="date"
          required
          value={date}
          onChange={(e) =>
            onChange({
              ...draft,
              start_time: combineDateTime(e.target.value, startTime),
              end_time: draft.end_time ? combineDateTime(e.target.value, endTime) : draft.end_time,
            })
          }
        />
      </label>
      <label className="field">
        <span><span className="req">*</span> Start time</span>
        <input
          type="time"
          required
          value={startTime}
          onChange={(e) => onChange({ ...draft, start_time: combineDateTime(date, e.target.value) })}
        />
      </label>
      <label className="field">
        End time
        <input
          type="time"
          value={endTime}
          onChange={(e) => onChange({ ...draft, end_time: e.target.value ? combineDateTime(date, e.target.value) : '' })}
        />
      </label>
    </>
  )
}

function toggleWeekday(recurrence_days: string, day: number): string {
  const days = recurrence_days ? recurrence_days.split(',').map(Number) : []
  const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort()
  return next.join(',')
}

function RecurrenceFields({ draft, onChange }: { draft: Draft; onChange: (draft: Draft) => void }) {
  const selectedDays = draft.recurrence_days ? draft.recurrence_days.split(',').map(Number) : []
  return (
    <div className="recurrence-fields">
      <span>Repeats weekly on:</span>
      {WEEKDAY_LABELS.map((label, day) => (
        <label key={day}>
          <input
            type="checkbox"
            checked={selectedDays.includes(day)}
            onChange={() => onChange({ ...draft, recurrence_days: toggleWeekday(draft.recurrence_days, day) })}
          />
          {label}
        </label>
      ))}
      {draft.recurrence_days && (
        <>
          <label>
            Until
            <input
              type="date"
              value={draft.recurrence_until}
              onChange={(e) => onChange({ ...draft, recurrence_until: e.target.value })}
            />
          </label>
          <p className="field-hint recurrence-hint">
            Creates one event per week. Each only appears on the public site starting 7 days before it happens, and
            has its own signups.
          </p>
        </>
      )}
    </div>
  )
}

function MoreOptionsToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="more-options-toggle" onClick={onToggle} aria-expanded={open}>
      <span className="field-row-chevron" aria-hidden="true">
        {open ? '▾' : '▸'}
      </span>
      {open ? 'Fewer options' : 'More options'}{' '}
      <span className="field-hint">(address, repeats, tags)</span>
    </button>
  )
}

function SignupFields({
  draft,
  onChange,
  forms,
}: {
  draft: Draft
  onChange: (draft: Draft) => void
  forms: FormTemplate[]
}) {
  return (
    <fieldset className="signup-fieldset">
      <legend>Signup</legend>
      <label className="switch-row">
        <input
          type="checkbox"
          checked={draft.signup_enabled}
          onChange={(e) => onChange({ ...draft, signup_enabled: e.target.checked })}
        />
        Enable RSVP / signup for this event
      </label>

      {draft.signup_enabled && (
        <label className="switch-row">
          <input
            type="checkbox"
            checked={draft.rsvp_gated}
            onChange={(e) => onChange({ ...draft, rsvp_gated: e.target.checked })}
          />
          Require admin approval (gated RSVP) &mdash; requests stay pending until approved or denied
        </label>
      )}

      {draft.signup_enabled && (
        <div className="grid2">
          <label className="field">
            Form <span className="field-hint">(optional &mdash; name &amp; email always collected)</span>
            <select value={draft.form_id} onChange={(e) => onChange({ ...draft, form_id: e.target.value })}>
              <option value="">No form &mdash; just name &amp; email</option>
              {forms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Capacity <span className="field-hint">(optional)</span>
            <input
              type="number"
              min="0"
              value={draft.capacity}
              onChange={(e) => onChange({ ...draft, capacity: e.target.value })}
            />
          </label>
          <label className="field">
            Signup deadline <span className="field-hint">(optional &mdash; closes signup before the event starts)</span>
            <input
              type="datetime-local"
              value={draft.signup_deadline}
              onChange={(e) => onChange({ ...draft, signup_deadline: e.target.value })}
            />
          </label>
        </div>
      )}
    </fieldset>
  )
}

function SignupsPanel({
  eventId,
  eventTitle,
  onChanged,
}: {
  eventId: number
  eventTitle: string
  onChanged: () => void
}) {
  const [signups, setSignups] = useState<EventSignup[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [releasing, setReleasing] = useState(false)
  const [announceOpen, setAnnounceOpen] = useState(false)
  const [announceSubject, setAnnounceSubject] = useState('')
  const [announceMessage, setAnnounceMessage] = useState('')
  const [announcing, setAnnouncing] = useState(false)
  const [announceNote, setAnnounceNote] = useState<string | null>(null)

  function refresh() {
    adminApi.events
      .signups(eventId)
      .then((res) => setSignups(res.signups))
      .catch((e: Error) => setError(e.message))
  }

  useEffect(refresh, [eventId])

  async function handleRemove(signupId: number) {
    if (!confirm('Remove this person from the signup list?')) return
    try {
      await adminApi.events.removeSignup(eventId, signupId)
      refresh()
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleDecide(signupId: number, status: 'approved' | 'denied' | 'waitlist') {
    try {
      await adminApi.events.decideSignup(eventId, signupId, status)
      refresh()
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleToggleCheckedIn(signupId: number, checkedIn: boolean) {
    try {
      await adminApi.events.setCheckedIn(eventId, signupId, checkedIn)
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleRelease() {
    if (!confirm(`Release all pending requests for ${eventTitle}? Anyone who fits will be approved; the rest go to the waitlist.`)) return
    setReleasing(true)
    try {
      const res = await adminApi.events.release(eventId)
      setAnnounceNote(`Released: ${res.approved} approved, ${res.waitlisted} waitlisted.`)
      refresh()
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setReleasing(false)
    }
  }

  async function handleAnnounce(ev: React.FormEvent) {
    ev.preventDefault()
    setAnnouncing(true)
    setAnnounceNote(null)
    try {
      const res = await adminApi.events.announce(eventId, { subject: announceSubject, message: announceMessage })
      setAnnounceNote(`Emailed ${res.recipient_count} ${res.recipient_count === 1 ? 'person' : 'people'}.`)
      setAnnounceSubject('')
      setAnnounceMessage('')
      setAnnounceOpen(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setAnnouncing(false)
    }
  }

  if (error) return <p className="admin-error">{error}</p>
  if (!signups) return <p className="admin-note">Loading&hellip;</p>

  const pendingCount = signups.filter((s) => s.status === 'pending').length

  return (
    <>
      <div className="signups-panel-actions">
        <button
          className="btn btn-outline btn-sm"
          type="button"
          disabled={signups.length === 0}
          onClick={() => exportSignupsCsv(eventTitle, signups)}
        >
          Download CSV
        </button>
        <button className="btn btn-outline btn-sm" type="button" disabled={pendingCount === 0 || releasing} onClick={handleRelease}>
          {releasing ? 'Releasing…' : `Release ${pendingCount} pending`}
        </button>
        <button
          className="btn btn-outline btn-sm"
          type="button"
          disabled={signups.length === 0}
          onClick={() => setAnnounceOpen((v) => !v)}
        >
          Email announcement
        </button>
      </div>
      {announceNote && <p className="admin-note">{announceNote}</p>}
      {announceOpen && (
        <form className="announce-form" onSubmit={handleAnnounce}>
          <label className="field">
            Subject
            <input required value={announceSubject} onChange={(e) => setAnnounceSubject(e.target.value)} />
          </label>
          <label className="field">
            Message
            <textarea
              required
              rows={4}
              value={announceMessage}
              onChange={(e) => setAnnounceMessage(e.target.value)}
            />
          </label>
          <p className="field-hint">Emails everyone signed up for this event (approved, waitlisted, and pending).</p>
          <div className="form-actions">
            <button className="btn btn-outline" type="button" onClick={() => setAnnounceOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-ace" type="submit" disabled={announcing}>
              {announcing ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      )}
      {signups.length === 0 ? (
        <p className="admin-note">No one has signed up yet.</p>
      ) : (
      <table className="signups-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Answers</th>
          <th>Status</th>
          <th>Checked in</th>
          <th>Submitted</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {signups.map((s) => (
          <tr key={s.id}>
            <td>{s.name}</td>
            <td>{s.email}</td>
            <td>
              {s.answers
                ? Object.values(s.answers).filter(Boolean).join(', ') || '—'
                : '—'}
            </td>
            <td>
              <span className={`status-chip status-${s.status}`}>{s.status}</span>
            </td>
            <td>
              {s.status === 'approved' && (
                <button
                  type="button"
                  className={s.checked_in_at ? 'signups-toggle checked-in' : 'signups-toggle'}
                  onClick={() => handleToggleCheckedIn(s.id, !s.checked_in_at)}
                >
                  {s.checked_in_at ? `✓ ${new Date(s.checked_in_at).toLocaleTimeString()}` : 'Check in'}
                </button>
              )}
            </td>
            <td>{new Date(s.created_at).toLocaleDateString()}</td>
            <td>
              <span className="row-actions">
                {s.status === 'pending' && (
                  <>
                    <button type="button" onClick={() => handleDecide(s.id, 'approved')}>
                      Approve
                    </button>
                    <button type="button" className="danger" onClick={() => handleDecide(s.id, 'denied')}>
                      Deny
                    </button>
                  </>
                )}
                {s.status === 'waitlist' && (
                  <button type="button" onClick={() => handleDecide(s.id, 'approved')}>
                    Promote
                  </button>
                )}
                {s.status === 'approved' && (
                  <button type="button" onClick={() => handleDecide(s.id, 'waitlist')}>
                    Move to waitlist
                  </button>
                )}
                <button type="button" className="danger" onClick={() => handleRemove(s.id)}>
                  Remove
                </button>
              </span>
            </td>
          </tr>
        ))}
      </tbody>
      </table>
      )}
    </>
  )
}

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
  const [events, setEvents] = useState<AdminEventRow[]>([])
  const [forms, setForms] = useState<FormTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft)
  const [creating, setCreating] = useState(false)
  const [createDraft, setCreateDraft] = useState<Draft>(emptyDraft)
  const descriptionRef = useAutosizeTextarea(createDraft.description)
  const editDescriptionRef = useAutosizeTextarea(editDraft.description)
  const [signupsOpenFor, setSignupsOpenFor] = useState<number | null>(null)
  const selection = useSelection()
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [bulkDraft, setBulkDraft] = useState<BulkDraft>(emptyBulkDraft)
  const [bulkShiftDays, setBulkShiftDays] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  // Address/recurrence/tags are behind one disclosure toggle so the common
  // case (title, type, when/where, description, signup) reads as a short
  // form, Google-Forms-style, instead of every field up front. Shared
  // between create and edit since only one of those modals is ever open.
  const [showMoreOptions, setShowMoreOptions] = useState(false)

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
    setEditingId(null)
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

  async function handleSave(id: number) {
    try {
      await adminApi.events.update(id, toInput(editDraft))
      setEditingId(null)
      refresh()
    } catch (e) {
      setError((e as Error).message)
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

  const seriesCounts = new Map<number, number>()
  for (const ev of events) {
    if (ev.series_id) seriesCounts.set(ev.series_id, (seriesCounts.get(ev.series_id) ?? 0) + 1)
  }

  return (
    <>
      <div className="admin-main-head">
        <h2>Events</h2>
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
      {error && <p className="admin-error">{error}</p>}
      {creating && (
        <AdminModal title="New event" onClose={() => setCreating(false)} wide>
        <form className="event-form" onSubmit={handleCreate}>
          <fieldset>
            <legend>Details</legend>
            <div className="grid2">
              <label className="field">
                <span><span className="req">*</span> Title</span>
                <input
                  required
                  value={createDraft.title}
                  onChange={(e) => setCreateDraft({ ...createDraft, title: e.target.value })}
                />
              </label>
              <label className="field">
                <span><span className="req">*</span> Type</span>
                <select
                  required
                  value={createDraft.event_type}
                  onChange={(e) => setCreateDraft({ ...createDraft, event_type: e.target.value })}
                >
                  <option value="practice">Practice</option>
                  <option value="tournament">Tournament</option>
                  <option value="open_gym">Open gym</option>
                  <option value="game">Game</option>
                  <option value="social">Social</option>
                </select>
              </label>
            </div>
            <label className="field">
              Description{' '}
              <span className="field-hint">(supports **bold**, *italic*, [links](url), and "- " lists)</span>
              <textarea
                ref={descriptionRef}
                rows={2}
                value={createDraft.description}
                onChange={(e) => setCreateDraft({ ...createDraft, description: e.target.value })}
              />
            </label>
          </fieldset>

          <fieldset>
            <legend>When &amp; where</legend>
            <div className="grid3">
              <EventDateTimeFields draft={createDraft} onChange={setCreateDraft} />
            </div>
            <div className="grid2">
              <label className="field">
                Location
                <input
                  value={createDraft.location_name}
                  onChange={(e) => setCreateDraft({ ...createDraft, location_name: e.target.value })}
                />
              </label>
              <label className="field">
                Status
                <select
                  value={createDraft.status}
                  onChange={(e) => setCreateDraft({ ...createDraft, status: e.target.value as EventStatus })}
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
            </div>
          </fieldset>

          <SignupFields draft={createDraft} onChange={setCreateDraft} forms={forms} />

          <MoreOptionsToggle open={showMoreOptions} onToggle={() => setShowMoreOptions((v) => !v)} />
          {showMoreOptions && (
            <fieldset>
              <legend>More options</legend>
              <label className="field">
                Address <span className="field-hint">(powers the &ldquo;Directions&rdquo; link)</span>
                <input
                  value={createDraft.location_address}
                  onChange={(e) => setCreateDraft({ ...createDraft, location_address: e.target.value })}
                />
              </label>
              <label className="field">
                Tags <span className="field-hint">(comma-separated, e.g. "beginner friendly, social")</span>
                <input value={createDraft.tags} onChange={(e) => setCreateDraft({ ...createDraft, tags: e.target.value })} />
              </label>
              <RecurrenceFields draft={createDraft} onChange={setCreateDraft} />
            </fieldset>
          )}

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
                  checked={events.length > 0 && events.every((e) => selection.isSelected(e.id))}
                  onChange={() => selection.toggleAll(events.map((e) => e.id))}
                />
              </th>
              <th>Title</th>
              <th>Type</th>
              <th>Starts</th>
              <th>Status</th>
              <th>Series</th>
              <th>Signups</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8}>Loading&hellip;</td>
              </tr>
            )}
            {!loading && events.length === 0 && (
              <tr>
                <td colSpan={8}>No events yet.</td>
              </tr>
            )}
            {events.map((ev) => (
                <Fragment key={ev.id}>
                  <tr>
                    <td className="select-col">
                      <input type="checkbox" checked={selection.isSelected(ev.id)} onChange={() => selection.toggle(ev.id)} />
                    </td>
                    <td>{ev.title}</td>
                    <td>{ev.event_type}</td>
                    <td>{new Date(ev.start_time).toLocaleString()}</td>
                    <td>
                      {ev.status !== 'cancelled' && ev.is_past ? (
                        <span className="status-chip status-completed">completed</span>
                      ) : (
                        <span className={`status-chip status-${ev.status}`}>{ev.status}</span>
                      )}
                    </td>
                    <td>{ev.series_id ? `Series of ${seriesCounts.get(ev.series_id) ?? 1}` : '—'}</td>
                    <td>
                      {ev.signup_enabled ? (
                        <button
                          type="button"
                          className="signups-toggle"
                          onClick={() => setSignupsOpenFor(signupsOpenFor === ev.id ? null : ev.id)}
                        >
                          {ev.signup_count} &middot; {ev.form_name ?? 'name & email'}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span className="row-actions">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(ev.id)
                            setEditDraft(eventToDraft(ev))
                            setShowMoreOptions(false)
                          }}
                        >
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
                  {signupsOpenFor === ev.id && (
                    <tr>
                      <td colSpan={8}>
                        <SignupsPanel eventId={ev.id} eventTitle={ev.title} onChanged={refresh} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            )}
          </tbody>
        </table>
      </div>
      {editingId !== null && (
        <AdminModal title="Edit event" onClose={() => setEditingId(null)} wide>
          <form
            className="event-form"
            onSubmit={(e) => {
              e.preventDefault()
              handleSave(editingId)
            }}
          >
            <fieldset>
              <legend>Details</legend>
              <div className="grid2">
                <label className="field">
                  <span><span className="req">*</span> Title</span>
                  <input
                    required
                    value={editDraft.title}
                    onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span><span className="req">*</span> Type</span>
                  <select
                    required
                    value={editDraft.event_type}
                    onChange={(e) => setEditDraft({ ...editDraft, event_type: e.target.value })}
                  >
                    <option value="practice">Practice</option>
                    <option value="tournament">Tournament</option>
                    <option value="open_gym">Open gym</option>
                    <option value="game">Game</option>
                    <option value="social">Social</option>
                  </select>
                </label>
              </div>
              <label className="field">
                Description{' '}
                <span className="field-hint">(supports **bold**, *italic*, [links](url), and "- " lists)</span>
                <textarea
                  ref={editDescriptionRef}
                  rows={2}
                  value={editDraft.description}
                  onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                />
              </label>
            </fieldset>
            <fieldset>
              <legend>When &amp; where</legend>
              <div className="grid3">
                <EventDateTimeFields draft={editDraft} onChange={setEditDraft} />
              </div>
              <div className="grid2">
                <label className="field">
                  Location
                  <input
                    value={editDraft.location_name}
                    onChange={(e) => setEditDraft({ ...editDraft, location_name: e.target.value })}
                  />
                </label>
                <label className="field">
                  Status
                  <select
                    value={editDraft.status}
                    onChange={(e) => setEditDraft({ ...editDraft, status: e.target.value as EventStatus })}
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </label>
              </div>
            </fieldset>
            <SignupFields draft={editDraft} onChange={setEditDraft} forms={forms} />
            <MoreOptionsToggle open={showMoreOptions} onToggle={() => setShowMoreOptions((v) => !v)} />
            {showMoreOptions && (
              <fieldset>
                <legend>More options</legend>
                <label className="field">
                  Address <span className="field-hint">(powers the &ldquo;Directions&rdquo; link)</span>
                  <input
                    value={editDraft.location_address}
                    onChange={(e) => setEditDraft({ ...editDraft, location_address: e.target.value })}
                  />
                </label>
                <label className="field">
                  Tags <span className="field-hint">(comma-separated)</span>
                  <input value={editDraft.tags} onChange={(e) => setEditDraft({ ...editDraft, tags: e.target.value })} />
                </label>
              </fieldset>
            )}
            <div className="form-actions">
              <button className="btn btn-outline" type="button" onClick={() => setEditingId(null)}>
                Cancel
              </button>
              <button className="btn btn-ace" type="submit">
                Save
              </button>
            </div>
          </form>
        </AdminModal>
      )}
    </>
  )
}

export default EventsAdmin
