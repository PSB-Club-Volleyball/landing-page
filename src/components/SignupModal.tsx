import { useEffect, useMemo, useState } from 'react'
import { WAIVER_URL } from '../constants'
import { cancelSignup, getForm, getLoginProviders, getMe, submitSignup } from '../lib/api'
import { getSignupState } from '../lib/eventFormat'
import { signInOptions } from '../lib/signInOptions'
import OAuthButton from './OAuthButton'
import { buildPages, FieldInput } from '../lib/formFields'
import { linkifyText } from '../lib/markdown'
import { useModalFocus } from '../lib/useModalFocus'
import type { FieldType, FormWithFields, PublicClubEvent, SignupStatus } from '../types'

const GROUP_FIELD_TYPES = new Set<FieldType>(['radio', 'checkbox_group', 'linear_scale'])

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
  const [loggedIn, setLoggedIn] = useState(false)
  // Until getMe answers we don't know whether to show the guest sign-in nudge.
  const [meChecked, setMeChecked] = useState(false)
  const [providers, setProviders] = useState({ google: false, microsoft: false, microsoft_other: false })
  const [nudgeDismissed, setNudgeDismissed] = useState(false)

  useEffect(() => {
    getLoginProviders()
      .then(setProviders)
      .catch((e) => console.error('getLoginProviders failed; hiding sign-in options', e))
  }, [])

  useEffect(() => {
    if (!event.form_id) return
    let cancelled = false
    getForm(event.form_id)
      .then((res) => {
        if (!cancelled) setForm(res.form)
      })
      .catch((e) => {
        console.error('getForm failed', e)
        if (!cancelled) setLoadError("Couldn't load the signup form — try again in a moment.")
      })
    return () => {
      cancelled = true
    }
  }, [event.form_id])

  useEffect(() => {
    let cancelled = false
    getMe()
      .then((res) => {
        if (cancelled) return
        setMeChecked(true)
        if (!res.user) return
        setLoggedIn(true)
        setName((prev) => prev || res.user!.name || '')
        setEmail((prev) => prev || res.user!.email)
        setWaiverOnFile(res.user!.waiverSignedYear === new Date().getFullYear())
      })
      .catch((e) => console.error('getMe failed; hiding the sign-in nudge', e))
    return () => {
      cancelled = true
    }
  }, [])

  const dialogRef = useModalFocus<HTMLDivElement>(onClose)

  const pages = useMemo(() => buildPages(form?.fields ?? []), [form])
  const onLastPage = pageIndex >= pages.length - 1

  function currentPageMissingField(): string | null {
    for (const field of pages[pageIndex]?.fields ?? []) {
      if (field.required && !String(answers[field.id] ?? '').trim()) return field.label
    }
    return null
  }

  function goNext(formEl: HTMLFormElement | null) {
    if (!formEl) throw new Error('Next button is outside the signup form')
    // "Next" isn't a submit, so the browser won't check this page's native
    // constraints (page 0's name/email, patterns, min/max) on its own.
    if (!formEl.reportValidity()) return
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

  const { spotsLeft, deadlinePassed, verb } = getSignupState(event)

  return (
    <div className="signup-overlay">
      <div
        className="signup-modal"
        role="dialog"
        aria-modal="true"
        aria-label={confirmed ? `${verb} confirmation` : `${verb} for ${event.title}`}
        tabIndex={-1}
        ref={dialogRef}
      >
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
                {submitError && <p className="admin-error" role="alert">{submitError}</p>}
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
                {submitError && <p className="admin-error" role="alert">{submitError}</p>}
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
                  {linkifyText(
                    form?.confirmation_message ||
                      `You're signed up for ${event.title}. See you at ${event.location_name || 'the event'}.`,
                  )}
                </p>
                {submitError && <p className="admin-error" role="alert">{submitError}</p>}
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
            {/* A guest RSVP is matched to an account by email: the profile's
                upcoming RSVPs and tournament results both look it up that way,
                so signing in with the same email picks this one up. */}
            {meChecked &&
              !loggedIn &&
              !existingSignupId &&
              !nudgeDismissed &&
              !signupCancelled &&
              (signupStatus === 'approved' || signupStatus === 'pending') &&
              signInOptions(providers).length > 0 && (
                <div className="signup-google-prompt">
                  <p>
                    Want your wins and stripes to count? Sign in with the same email and this RSVP joins your profile.
                  </p>
                  <div className="signup-oauth-options">
                    {signInOptions(providers).map((opt) => (
                      <OAuthButton key={opt.id} option={opt} redirect={`/events/${event.id}`} />
                    ))}
                  </div>
                  <button className="link-btn" type="button" onClick={() => setNudgeDismissed(true)}>
                    Not now
                  </button>
                </div>
              )}
            {!signupCancelled && signupStatus !== 'denied' && (
              <p className="waiver-download-note">
                Don&rsquo;t forget to{' '}
                <a href={WAIVER_URL} target="_blank" rel="noreferrer">
                  download and print the liability waiver
                </a>{' '}
                and bring the signed copy to the event.
              </p>
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

            {loadError && <p className="admin-error" role="alert">{loadError}</p>}
            {!loadError && deadlinePassed && (
              <p className="admin-error" role="alert">
                Deadline for registration passed.
              </p>
            )}

            {!loadError && !deadlinePassed && (
              <form className="signup-form" onSubmit={onLastPage ? handleSubmit : (e) => e.preventDefault()}>
                {pageIndex === 0 && (
                  <>
                    {!loggedIn && signInOptions(providers).length > 0 && (
                      <div className="signup-google-prompt">
                        <p>
                          Have an account, or want one? Sign in to skip re-typing your info next time &mdash;
                          it&rsquo;s optional, you can {verb.toLowerCase()} as a guest below instead. Penn State
                          Behrend accounts work with Microsoft sign-in.
                        </p>
                        <div className="signup-oauth-options">
                          {signInOptions(providers).map((opt) => (
                            <OAuthButton
                              key={opt.id}
                              option={opt}
                              redirect={`/events/${event.id}?signup=${event.id}`}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    <label className="field">
                      <span><span className="req" aria-hidden="true">*</span> Name</span>
                      <input type="text" required value={name} onChange={(e) => setName(e.target.value)} />
                    </label>
                    <label className="field">
                      <span><span className="req" aria-hidden="true">*</span> Email</span>
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
                    {pages[pageIndex].heading!.description && <p>{linkifyText(pages[pageIndex].heading!.description!)}</p>}
                  </div>
                )}

                {pages[pageIndex]?.fields.map((field) => {
                  const question = (
                    <>
                      <span id={`field-${field.id}-label`}>
                        {field.required && <span className="req" aria-hidden="true">* </span>}
                        {field.label}
                      </span>
                      {field.description && <span className="field-desc">{linkifyText(field.description)}</span>}
                      <FieldInput
                        field={field}
                        value={answers[field.id] ?? ''}
                        onChange={(v) => setAnswers({ ...answers, [field.id]: v })}
                      />
                    </>
                  )
                  // Choice groups hold their own per-option labels, so the
                  // question can't be a <label> too (nested labels are invalid,
                  // and clicking the question would pick the first option).
                  return GROUP_FIELD_TYPES.has(field.field_type) ? (
                    <div className="field" role="group" aria-labelledby={`field-${field.id}-label`} key={field.id}>
                      {question}
                    </div>
                  ) : (
                    <label className="field" key={field.id}>
                      {question}
                    </label>
                  )
                })}

                {pageError && <p className="admin-error" role="alert">{pageError}</p>}
                {submitError && <p className="admin-error" role="alert">{submitError}</p>}

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
                      <button className="btn btn-ace" type="button" onClick={(e) => goNext(e.currentTarget.form)}>
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
