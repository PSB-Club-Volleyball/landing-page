import { useEffect, useMemo, useState } from 'react'
import { cancelSignup, getForm, getMe, submitSignup } from '../lib/api'
import type { FormWithFields, PublicClubEvent, SignupStatus } from '../types'

const WAIVER_URL = '/liability-waiver.pdf'

type FormFieldType = FormWithFields['fields'][number]

function toggleInList(current: string, option: string): string {
  const items = current ? current.split('|') : []
  const next = items.includes(option) ? items.filter((i) => i !== option) : [...items, option]
  return next.join('|')
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FormFieldType
  value: string
  onChange: (v: string) => void
}) {
  const commonProps = {
    id: `field-${field.id}`,
    required: field.required,
    value,
  }

  if (field.field_type === 'textarea') {
    return (
      <textarea
        {...commonProps}
        rows={3}
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

interface Page {
  heading: FormFieldType | null
  fields: FormFieldType[]
}

// Fields are laid out in submit order; a 'section' field is a page break —
// it renders as a heading, and everything after it (up to the next section)
// becomes a new page, mirroring Google Forms' section-per-page behavior.
function buildPages(fields: FormFieldType[]): Page[] {
  const pages: Page[] = [{ heading: null, fields: [] }]
  for (const field of fields) {
    if (field.field_type === 'section') {
      pages.push({ heading: field, fields: [] })
    } else {
      pages[pages.length - 1].fields.push(field)
    }
  }
  return pages.filter((p) => p.heading || p.fields.length > 0)
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
  const [pageIndex, setPageIndex] = useState(0)
  const [pageError, setPageError] = useState<string | null>(null)
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

  const pages = useMemo(() => buildPages(form?.fields ?? []), [form])
  const onLastPage = pageIndex >= pages.length - 1

  function currentPageMissingField(): string | null {
    for (const field of pages[pageIndex]?.fields ?? []) {
      if (field.required && !String(answers[field.id] ?? '').trim()) return field.label
    }
    return null
  }

  function goNext() {
    const missing = currentPageMissingField()
    if (missing) {
      setPageError(`"${missing}" is required`)
      return
    }
    setPageError(null)
    setPageIndex((i) => i + 1)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const missing = currentPageMissingField()
    if (missing) {
      setPageError(`"${missing}" is required`)
      return
    }
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
            ) : signupStatus === 'waitlist' ? (
              <>
                <h4>You&rsquo;re on the waitlist</h4>
                <p>
                  {event.title} is full, so you&rsquo;ve been added to the waitlist. We&rsquo;ll email you right away if a
                  spot opens up.
                </p>
                {submitError && <p className="admin-error">{submitError}</p>}
                <p className="cancel-note">
                  Changed your mind?{' '}
                  <button className="link-btn" type="button" disabled={cancelling} onClick={handleCancel}>
                    {cancelling ? 'Cancelling…' : 'Leave the waitlist'}
                  </button>
                </p>
              </>
            ) : (
              <>
                <h4>You&rsquo;re in!</h4>
                <p>
                  {form?.confirmation_message || `You're signed up for ${event.title}. See you at ${event.location_name || 'the event'}.`}
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
              <form className="signup-form" onSubmit={onLastPage ? handleSubmit : (e) => e.preventDefault()}>
                {pageIndex === 0 && (
                  <>
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
                  </>
                )}

                {pages.length > 1 && (
                  <p className="signup-page-indicator">
                    Page {pageIndex + 1} of {pages.length}
                  </p>
                )}
                {pages[pageIndex]?.heading && (
                  <div className="signup-section-heading">
                    <h5>{pages[pageIndex].heading!.label}</h5>
                    {pages[pageIndex].heading!.description && <p>{pages[pageIndex].heading!.description}</p>}
                  </div>
                )}

                {pages[pageIndex]?.fields.map((field) => (
                  <label className="field" key={field.id}>
                    {field.label}
                    {field.required && <span className="req"> *</span>}
                    {field.description && <span className="field-desc">{field.description}</span>}
                    <FieldInput
                      field={field}
                      value={answers[field.id] ?? ''}
                      onChange={(v) => setAnswers({ ...answers, [field.id]: v })}
                    />
                  </label>
                ))}

                {pageError && <p className="admin-error">{pageError}</p>}
                {submitError && <p className="admin-error">{submitError}</p>}

                <div className="signup-modal-ft">
                  <span className="signup-note">
                    {spotsLeft !== null ? `${Math.max(spotsLeft, 0)} spots left` : ''}
                  </span>
                  <span className="signup-modal-ft-actions">
                    {pageIndex > 0 && (
                      <button
                        className="btn btn-outline"
                        type="button"
                        onClick={() => {
                          setPageError(null)
                          setPageIndex((i) => i - 1)
                        }}
                      >
                        Back
                      </button>
                    )}
                    {onLastPage ? (
                      <button className="btn btn-ace" type="submit" disabled={submitting || (event.form_id != null && !form)}>
                        {submitting ? 'Submitting…' : `Confirm ${verb}`}
                      </button>
                    ) : (
                      <button className="btn btn-ace" type="button" onClick={goNext}>
                        Next
                      </button>
                    )}
                  </span>
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
