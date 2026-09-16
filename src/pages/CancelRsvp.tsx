import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { cancelSignup } from '../lib/api'

// Landing page for the cancel link emailed at signup/approval time — the
// only way a guest (no account) signup can be managed, since nothing is
// kept in their browser to prove it's theirs. Requires an explicit click
// rather than cancelling on load, so an email client's link-prescan can't
// trigger it.
function CancelRsvp() {
  const { eventId, signupId } = useParams<{ eventId: string; signupId: string }>()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [status, setStatus] = useState<'idle' | 'cancelling' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const validParams = Number.isInteger(Number(eventId)) && Number.isInteger(Number(signupId)) && Boolean(token)

  async function handleCancel() {
    if (!validParams) return
    setStatus('cancelling')
    setError(null)
    try {
      await cancelSignup(Number(eventId), Number(signupId), token ?? undefined)
      setStatus('done')
    } catch (err) {
      setError((err as Error).message)
      setStatus('error')
    }
  }

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="board cancel-rsvp-card">
        {!validParams ? (
          <>
            <h1>Invalid link</h1>
            <p className="placeholder-note">This cancellation link looks broken or incomplete.</p>
          </>
        ) : status === 'done' ? (
          <>
            <h1>Cancelled</h1>
            <p className="placeholder-note">You&rsquo;re no longer signed up. A confirmation email is on its way.</p>
          </>
        ) : (
          <>
            <h1>Cancel your RSVP?</h1>
            <p className="placeholder-note">This will remove your spot for this event.</p>
            {error && <p className="admin-error">{error}</p>}
            <button className="btn btn-ace" type="button" disabled={status === 'cancelling'} onClick={handleCancel}>
              {status === 'cancelling' ? 'Cancelling…' : 'Cancel my RSVP'}
            </button>
          </>
        )}
      </div>
    </main>
  )
}

export default CancelRsvp
