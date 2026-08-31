import { useAutosizeTextarea } from '../../lib/autosize'
import type { EventStatus, EventVisibility, FormTemplate } from '../../types'
import {
  combineDateTime,
  splitDateTime,
  toggleWeekday,
  VISIBILITY_LABELS,
  WEEKDAY_LABELS,
  type Draft,
} from './eventDraft'

// Shared event-form pieces used by both the Events list's "New event" modal
// and the routed event page's Details tab. Every piece takes the whole Draft
// plus an onChange, so a parent can hold the draft in whatever state it likes.

export function EventDateTimeFields({ draft, onChange }: { draft: Draft; onChange: (draft: Draft) => void }) {
  const { date, time: startTime } = splitDateTime(draft.start_time)
  const { time: endTime } = splitDateTime(draft.end_time)

  return (
    <>
      <label className="field">
        <span>
          <span className="req">*</span> Date
        </span>
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
        <span>
          <span className="req">*</span> Start time
        </span>
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

// The Details form body shared between the "New event" modal and the event
// page. The caller owns the <form> element, the submit button, and any
// surrounding actions.
export function EventFormFields({
  draft,
  onChange,
  forms,
  showMoreOptions,
  onToggleMoreOptions,
  includeRecurrence,
}: {
  draft: Draft
  onChange: (draft: Draft) => void
  forms: FormTemplate[]
  showMoreOptions: boolean
  onToggleMoreOptions: () => void
  // Recurrence is only meaningful when creating; an existing event can't grow
  // a series, so the event page hides those checkboxes.
  includeRecurrence: boolean
}) {
  const descriptionRef = useAutosizeTextarea(draft.description)
  return (
    <>
      <fieldset>
        <legend>Details</legend>
        <div className="grid2">
          <label className="field">
            <span>
              <span className="req">*</span> Title
            </span>
            <input required value={draft.title} onChange={(e) => onChange({ ...draft, title: e.target.value })} />
          </label>
          <label className="field">
            <span>
              <span className="req">*</span> Type
            </span>
            <select
              required
              value={draft.event_type}
              onChange={(e) => onChange({ ...draft, event_type: e.target.value })}
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
            value={draft.description}
            onChange={(e) => onChange({ ...draft, description: e.target.value })}
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>When &amp; where</legend>
        <div className="grid3">
          <EventDateTimeFields draft={draft} onChange={onChange} />
        </div>
        <div className="grid2">
          <label className="field">
            Location
            <input
              value={draft.location_name}
              onChange={(e) => onChange({ ...draft, location_name: e.target.value })}
            />
          </label>
          <label className="field">
            Status
            <select
              value={draft.status}
              onChange={(e) => onChange({ ...draft, status: e.target.value as EventStatus })}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label className="field">
            Visibility <span className="field-hint">(who can see this event on the public site)</span>
            <select
              value={draft.visibility}
              onChange={(e) => onChange({ ...draft, visibility: e.target.value as EventVisibility })}
            >
              {(Object.keys(VISIBILITY_LABELS) as EventVisibility[]).map((v) => (
                <option key={v} value={v}>
                  {VISIBILITY_LABELS[v]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      <SignupFields draft={draft} onChange={onChange} forms={forms} />

      <MoreOptionsToggle open={showMoreOptions} onToggle={onToggleMoreOptions} />
      {showMoreOptions && (
        <fieldset>
          <legend>More options</legend>
          <label className="field">
            Address <span className="field-hint">(powers the &ldquo;Directions&rdquo; link)</span>
            <input
              value={draft.location_address}
              onChange={(e) => onChange({ ...draft, location_address: e.target.value })}
            />
          </label>
          <label className="field">
            Tags <span className="field-hint">(comma-separated, e.g. "beginner friendly, social")</span>
            <input value={draft.tags} onChange={(e) => onChange({ ...draft, tags: e.target.value })} />
          </label>
          {includeRecurrence && <RecurrenceFields draft={draft} onChange={onChange} />}
        </fieldset>
      )}
    </>
  )
}
