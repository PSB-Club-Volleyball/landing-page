import { Fragment, useEffect, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import type { AdminEventRow, EventSignup, EventStatus, FormTemplate } from '../../types'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const emptyDraft = {
  title: '',
  event_type: 'practice',
  start_time: '',
  end_time: '',
  location_name: '',
  status: 'draft' as EventStatus,
  description: '',
  recurrence_days: '' as string, // comma-separated weekday ints, e.g. "2,4,6"; empty = one-time
  recurrence_until: '',
  signup_enabled: false,
  form_id: '' as string, // '' = none chosen yet
  capacity: '' as string,
}
type Draft = typeof emptyDraft

function toInput(draft: Draft) {
  return {
    title: draft.title,
    event_type: draft.event_type,
    start_time: draft.start_time,
    end_time: draft.end_time || null,
    location_name: draft.location_name || null,
    status: draft.status,
    description: draft.description || null,
    recurrence_days: draft.recurrence_days || null,
    recurrence_until: draft.recurrence_days ? draft.recurrence_until || null : null,
    signup_enabled: draft.signup_enabled,
    form_id: draft.signup_enabled && draft.form_id ? Number(draft.form_id) : null,
    capacity: draft.signup_enabled && draft.capacity ? Number(draft.capacity) : null,
  }
}

function eventToDraft(e: AdminEventRow): Draft {
  return {
    title: e.title,
    event_type: e.event_type,
    start_time: e.start_time,
    end_time: e.end_time ?? '',
    location_name: e.location_name ?? '',
    status: e.status,
    description: e.description ?? '',
    // Recurrence is create-time only (see events.ts) — an existing row never carries it.
    recurrence_days: '',
    recurrence_until: '',
    signup_enabled: e.signup_enabled,
    form_id: e.form_id !== null ? String(e.form_id) : '',
    capacity: e.capacity !== null ? String(e.capacity) : '',
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
  return date && time ? `${date}T${time}` : ''
}

function EventDateTimeFields({ draft, onChange }: { draft: Draft; onChange: (draft: Draft) => void }) {
  const { date, time: startTime } = splitDateTime(draft.start_time)
  const { time: endTime } = splitDateTime(draft.end_time)

  return (
    <>
      <label className="field">
        Date <span className="req">*</span>
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
        Start time <span className="req">*</span>
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
          onChange={(e) => onChange({ ...draft, end_time: combineDateTime(date, e.target.value) })}
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
        </div>
      )}
    </fieldset>
  )
}

function SignupsPanel({ eventId, onChanged }: { eventId: number; onChanged: () => void }) {
  const [signups, setSignups] = useState<EventSignup[] | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  if (error) return <p className="admin-error">{error}</p>
  if (!signups) return <p className="admin-note">Loading&hellip;</p>
  if (signups.length === 0) return <p className="admin-note">No one has signed up yet.</p>

  return (
    <table className="signups-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Answers</th>
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
            <td>{new Date(s.created_at).toLocaleDateString()}</td>
            <td>
              <button type="button" className="danger" onClick={() => handleRemove(s.id)}>
                Remove
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
  const [signupsOpenFor, setSignupsOpenFor] = useState<number | null>(null)

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

  function startDuplicate(ev: AdminEventRow) {
    setCreateDraft({ ...eventToDraft(ev), start_time: '', end_time: '', status: 'draft' })
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
        <button className="add-btn" type="button" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Cancel' : '+ Add event'}
        </button>
      </div>
      {error && <p className="admin-error">{error}</p>}
      {creating && (
        <form className="event-form" onSubmit={handleCreate}>
          <fieldset>
            <legend>Details</legend>
            <div className="grid2">
              <label className="field">
                Title <span className="req">*</span>
                <input
                  required
                  value={createDraft.title}
                  onChange={(e) => setCreateDraft({ ...createDraft, title: e.target.value })}
                />
              </label>
              <label className="field">
                Type <span className="req">*</span>
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
              Description
              <textarea
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
            <RecurrenceFields draft={createDraft} onChange={setCreateDraft} />
          </fieldset>

          <SignupFields draft={createDraft} onChange={setCreateDraft} forms={forms} />

          <div className="form-actions">
            <button className="btn btn-outline" type="button" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button className="btn btn-ace" type="submit">
              Save event
            </button>
          </div>
        </form>
      )}
      <div className="data-table">
        <table>
          <thead>
            <tr>
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
                <td colSpan={7}>Loading&hellip;</td>
              </tr>
            )}
            {!loading && events.length === 0 && (
              <tr>
                <td colSpan={7}>No events yet.</td>
              </tr>
            )}
            {events.map((ev) =>
              editingId === ev.id ? (
                <tr key={ev.id}>
                  <td colSpan={7}>
                    <form
                      className="event-form event-form-inline"
                      onSubmit={(e) => {
                        e.preventDefault()
                        handleSave(ev.id)
                      }}
                    >
                      <fieldset>
                        <legend>Details</legend>
                        <div className="grid2">
                          <label className="field">
                            Title <span className="req">*</span>
                            <input
                              required
                              value={editDraft.title}
                              onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                            />
                          </label>
                          <label className="field">
                            Type <span className="req">*</span>
                            <input
                              required
                              value={editDraft.event_type}
                              onChange={(e) => setEditDraft({ ...editDraft, event_type: e.target.value })}
                            />
                          </label>
                        </div>
                      </fieldset>
                      <fieldset>
                        <legend>When &amp; where</legend>
                        <div className="grid3">
                          <EventDateTimeFields draft={editDraft} onChange={setEditDraft} />
                        </div>
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
                      </fieldset>
                      <SignupFields draft={editDraft} onChange={setEditDraft} forms={forms} />
                      <div className="form-actions">
                        <button className="btn btn-outline" type="button" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                        <button className="btn btn-ace" type="submit">
                          Save
                        </button>
                      </div>
                    </form>
                  </td>
                </tr>
              ) : (
                <Fragment key={ev.id}>
                  <tr>
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
                      <td colSpan={7}>
                        <SignupsPanel eventId={ev.id} onChanged={refresh} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

export default EventsAdmin
