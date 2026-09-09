import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { adminApi } from '../../lib/adminApi'
import type { AdminEventRow, FormTemplate } from '../../types'
import { EVENT_TYPE_LABELS } from '../../lib/eventFormat'
import { emptyDraft, eventToDraft, toInput, type Draft } from './eventDraft'
import { EventFormFields } from './eventForm'
import SignupsPanel from './SignupsPanel'
import TeamsAdmin from './TeamsAdmin'
import ScheduleAdmin from './ScheduleAdmin'

type Tab = 'details' | 'signups' | 'teams' | 'scores'

// Event types where splitting people into teams makes sense (everything but
// a purely social gathering).
const TEAM_TYPES = new Set(['practice', 'tournament', 'open_gym', 'game'])
// Formats that produce a schedule + results (everything but "teams only").
const SCORED_FORMATS = new Set(['round_robin', 'pool_bracket', 'single_elim', 'double_elim'])

// The routed admin page for one event at /admin/events/:eventId — replaces
// the old "Edit event" modal and the inline expanding signups row. Details
// holds the edit form; Signups holds the attendee roster.
export default function AdminEventPage({ isOwner }: { isOwner: boolean }) {
  const { eventId } = useParams<{ eventId: string }>()
  const id = Number(eventId)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab: Tab =
    tabParam === 'signups' ? 'signups' : tabParam === 'teams' ? 'teams' : tabParam === 'scores' ? 'scores' : 'details'

  const [event, setEvent] = useState<AdminEventRow | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [forms, setForms] = useState<FormTemplate[]>([])
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [showMoreOptions, setShowMoreOptions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState(false)

  // Initial load: on failure the whole page becomes the error view.
  function loadInitial() {
    if (!Number.isInteger(id)) {
      setLoadError('Invalid event id')
      setState('error')
      return
    }
    adminApi.events
      .get(id)
      .then((res) => {
        setEvent(res.event)
        setDraft(eventToDraft(res.event))
        setState('ready')
      })
      .catch((err: Error) => {
        console.error('Failed to load event', err)
        setLoadError(err.message)
        setState('error')
      })
  }

  // Background refetch after a mutation. Never tears down the page on a
  // transient failure, and only rebuilds the Details draft when asked
  // (`resetDraft`) — a signup change in the other tab must not wipe unsaved
  // edits.
  function refetch(resetDraft: boolean) {
    adminApi.events
      .get(id)
      .then((res) => {
        setEvent(res.event)
        if (resetDraft) setDraft(eventToDraft(res.event))
      })
      .catch((err: Error) => console.error('Failed to refresh event', err))
  }

  useEffect(loadInitial, [id])
  useEffect(() => {
    adminApi.forms
      .list()
      .then((res) => setForms(res.forms))
      .catch((err: Error) => console.error('Failed to load forms', err))
  }, [])

  function setTab(next: Tab) {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (next === 'details') p.delete('tab')
        else p.set('tab', next)
        return p
      },
      { replace: true }
    )
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSavedNote(false)
    try {
      await adminApi.events.update(id, toInput(draft))
      setSavedNote(true)
      refetch(true)
    } catch (err) {
      setSaveError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this event? This can’t be undone.')) return
    try {
      await adminApi.events.remove(id)
      navigate('/admin')
    } catch (err) {
      setSaveError((err as Error).message)
    }
  }

  if (state === 'loading') return <p className="admin-note">Loading&hellip;</p>
  if (state === 'error') {
    return (
      <div className="admin-event-page">
        <Link className="admin-back-link" to="/admin">
          &larr; All events
        </Link>
        <h2>Couldn&rsquo;t load this event</h2>
        {loadError && <p className="admin-error">{loadError}</p>}
      </div>
    )
  }

  const e = event as AdminEventRow

  return (
    <div className="admin-event-page">
      <Link className="admin-back-link" to="/admin">
        &larr; All events
      </Link>
      <div className="admin-main-head">
        <div>
          <p className="admin-event-eyebrow">
            {EVENT_TYPE_LABELS[e.event_type] ?? e.event_type} &middot;{' '}
            {e.status !== 'cancelled' && e.is_past ? 'completed' : e.status}
          </p>
          <h2>{e.title}</h2>
          <p className="admin-event-sub">
            {new Date(e.start_time).toLocaleString()} &middot; {e.signup_count} signup
            {e.signup_count === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <div className="admin-subtabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'details'}
          className={tab === 'details' ? 'active' : undefined}
          onClick={() => setTab('details')}
        >
          Details
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'signups'}
          className={tab === 'signups' ? 'active' : undefined}
          onClick={() => setTab('signups')}
        >
          Signups {e.signup_count > 0 && <span className="admin-subtab-count">{e.signup_count}</span>}
        </button>
        {TEAM_TYPES.has(e.event_type) && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'teams'}
            className={tab === 'teams' ? 'active' : undefined}
            onClick={() => setTab('teams')}
          >
            Teams &amp; format
          </button>
        )}
        {TEAM_TYPES.has(e.event_type) && e.play_format != null && SCORED_FORMATS.has(e.play_format) && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'scores'}
            className={tab === 'scores' ? 'active' : undefined}
            onClick={() => setTab('scores')}
          >
            {e.play_format === 'single_elim' || e.play_format === 'double_elim' ? 'Bracket' : 'Schedule & scores'}
          </button>
        )}
      </div>

      {tab === 'details' && (
        <form className="event-form" onSubmit={handleSave}>
          <EventFormFields
            draft={draft}
            onChange={setDraft}
            forms={forms}
            showMoreOptions={showMoreOptions}
            onToggleMoreOptions={() => setShowMoreOptions((v) => !v)}
            includeRecurrence={false}
          />
          {saveError && <p className="admin-error">{saveError}</p>}
          {savedNote && <p className="admin-note">Saved.</p>}
          <div className="form-actions">
            {isOwner && (
              <button className="btn btn-outline danger" type="button" onClick={handleDelete}>
                Delete event
              </button>
            )}
            <span className="form-actions-spacer" />
            <button className="btn btn-outline" type="button" onClick={() => navigate('/admin')}>
              Back
            </button>
            <button className="btn btn-ace" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}

      {tab === 'signups' && (
        <SignupsPanel eventId={id} eventTitle={e.title} onChanged={() => refetch(false)} />
      )}

      {tab === 'teams' && TEAM_TYPES.has(e.event_type) && <TeamsAdmin eventId={id} onFormatChange={() => refetch(false)} />}

      {tab === 'scores' && e.play_format != null && SCORED_FORMATS.has(e.play_format) && (
        <ScheduleAdmin eventId={id} playFormat={e.play_format} />
      )}
    </div>
  )
}
