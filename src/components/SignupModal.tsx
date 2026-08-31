import { useEffect, useState } from 'react'
import { cancelSignup, getForm, getMe, submitSignup } from '../lib/api'
import type { FormWithFields, PublicClubEvent, SignupStatus } from '../types'

const WAIVER_URL = '/liability-waiver.pdf'

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FormWithFields['fields'][number]
  value: string
  onChange: (v: string) => void
}) {
  const commonProps = {
    id: `field-${field.id}`,
    required: field.required,
    value,
  }
  if (field.field_type === 'textarea') {
    return <textarea {...commonProps} rows={3} onChange={(e) => onChange(e.target.value)} />
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
  return (
    <input
      {...commonProps}
      type={field.field_type === 'number' ? 'number' : 'text'}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

function SignupModal({
  event,
  onClose,
  onCancelled,
  existingSignupId,
  existingSignupStatus,
}: {
  event: PublicClubEvent
  onClose: () => void
  onCancelled?: () => void
  // When the visitor already signed up (matched via a logged-in session),
  // open straight into the "manage my RSVP" view instead of the signup form.
  existingSignupId?: number
  existingSignupStatus?: SignupStatus | null
}) {
  const [form, setForm] = useState<FormWithFields | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('') // honeypot
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(Boolean(existingSignupId))
  const [confirmedSignupId, setConfirmedSignupId] = useState<number | null>(existingSignupId ?? null)
  const [signupStatus, setSignupStatus] = useState<SignupStatus | null>(existingSignupStatus ?? null)
  // Only held in memory for the rest of this page view (to allow an
  // immediate "changed my mind" cancel right after submitting) — never
  // persisted, since a guest signup has no account and nothing is kept in
  // the browser. Managing it later happens via the link emailed at signup.
  const [cancelToken, setCancelToken] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [signupCancelled, setSignupCancelled] = useState(false)
  // Only a logged-in account can confirm a waiver's on file; a walk-up
  // signup has no way to know, so it defaults to showing the download link.
  const [waiverOnFile, setWaiverOnFile] = useState(false)

  useEffect(() => {
    if (!event.form_id) return
    let cancelled = false
    getForm(event.form_id)
      .then((res) => {
        if (!cancelled) setForm(res.form)
      })
      .catch(() => {
        if (!cancelled) setLoadError("Couldn't load the signup form — try again in a moment.")
      })
    return () => {
      cancelled = true
    }
  }, [event.form_id])

  useEffect(() => {
    let cancelled = false
    getMe().then((res) => {
      if (cancelled || !res.user) return
      setName((prev) => prev || res.user!.name || '')
      setEmail((prev) => prev || res.user!.email)
      setWaiverOnFile(res.user!.waiverSignedYear === new Date().getFullYear())
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await submitSignup(event.id, { name, email, answers, company })
      setConfirmedSignupId(res.id)
      setCancelToken(res.cancel_token)
      setSignupStatus(res.status)
      setConfirmed(true)
    } catch (err) {
      setSubmitError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancel() {
    if (!confirmedSignupId) return
    setCancelling(true)
    try {
      await cancelSignup(event.id, confirmedSignupId, cancelToken ?? undefined)
      setSignupCancelled(true)
      onCancelled?.()
    } catch (err) {
      setSubmitError((err as Error).message)
    } finally {
      setCancelling(false)
    }
  }

  const spotsLeft = event.capacity !== null ? event.capacity - event.signup_count : null
  const verb = event.rsvp_gated
    ? 'Request'
    : event.event_type === 'game' || event.event_type === 'tournament'
      ? 'RSVP'
      : 'Sign up'

  return (
    <div className="signup-overlay" role="dialog" aria-modal="true" aria-label={`${verb} for ${event.title}`}>
      <div className="signup-modal">
        {confirmed ? (
          <div className="signup-confirm">
            <div className="signup-confirm-tick">&#10003;</div>
            {signupCancelled ? (
              <>
                <h4>Cancelled</h4>
                <p>You&rsquo;re no longer signed up for {event.title}.</p>
              </>
            ) : signupStatus === 'denied' ? (
              <>
                <h4>Request not approved</h4>
                <p>Your request to attend {event.title} wasn&rsquo;t approved. Reach out to an admin with questions.</p>
              </>
            ) : signupStatus === 'pending' ? (
              <>
                <h4>Request received</h4>
                <p>
                  Your request to attend {event.title} is awaiting admin approval. We&rsquo;ll email you once it&rsquo;s
                  reviewed.
                </p>
                {submitError && <p className="admin-error">{submitError}</p>}
                <p className="cancel-note">
                  Changed your mind?{' '}
                  <button className="link-btn" type="button" disabled={cancelling} onClick={handleCancel}>
                    {cancelling ? 'Cancelling…' : 'Withdraw my request'}
                  </button>
                </p>
              </>
            ) : (
              <>
                <h4>You&rsquo;re in!</h4>
                <p>
                  You&rsquo;re signed up for {event.title}. See you at {event.location_name || 'the event'}.
                </p>
                {submitError && <p className="admin-error">{submitError}</p>}
                <p className="cancel-note">
                  Changed your mind?{' '}
                  <button className="link-btn" type="button" disabled={cancelling} onClick={handleCancel}>
                    {cancelling ? 'Cancelling…' : 'Cancel my RSVP'}
                  </button>
                  <br />
                  (also emailed to you &mdash; a logged-in account can also cancel from the event card)
                </p>
              </>
            )}
            <button className="btn btn-outline btn-sm" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="signup-modal-hd">
              <div>
                <p className="signup-eyebrow">{verb}</p>
                <h4>{event.title}</h4>
              </div>
              <button className="signup-close" type="button" aria-label="Close" onClick={onClose}>
                &times;
              </button>
            </div>

            {loadError && <p className="admin-error">{loadError}</p>}

            {!loadError && (
              <form className="signup-form" onSubmit={handleSubmit}>
                <label className="field">
                  Name
                  <input type="text" required value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="field">
                  Email
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </label>
                <div className="signup-honeypot" aria-hidden="true">
                  <label>
                    Leave blank
                    <input tabIndex={-1} autoComplete="off" value={company} onChange={(e) => setCompany(e.target.value)} />
                  </label>
                </div>

                {!waiverOnFile && (
                  <p className="waiver-download-note">
                    Haven&rsquo;t signed a liability waiver yet? You don&rsquo;t need one to {verb.toLowerCase()} &mdash;
                    just{' '}
                    <a href={WAIVER_URL} target="_blank" rel="noreferrer">
                      download and print it
                    </a>{' '}
                    and bring the signed copy to the event.
                  </p>
                )}

                {form?.fields.map((field) => (
                  <label className="field" key={field.id}>
                    {field.label}
                    {field.required && <span className="req"> *</span>}
                    <FieldInput
                      field={field}
                      value={answers[field.id] ?? ''}
                      onChange={(v) => setAnswers({ ...answers, [field.id]: v })}
                    />
                  </label>
                ))}

                {submitError && <p className="admin-error">{submitError}</p>}

                <div className="signup-modal-ft">
                  <span className="signup-note">
                    {spotsLeft !== null ? `${Math.max(spotsLeft, 0)} spots left` : ''}
                  </span>
                  <button className="btn btn-ace" type="submit" disabled={submitting || (event.form_id != null && !form)}>
                    {submitting ? 'Submitting…' : `Confirm ${verb}`}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default SignupModal
