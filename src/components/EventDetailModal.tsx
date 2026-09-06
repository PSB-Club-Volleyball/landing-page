import { useEffect } from 'react'
import { directionsUrl, EVENT_TYPE_LABELS, formatEventDate, formatTimeRange, getSignupState } from '../lib/eventFormat'
import { renderMarkdown } from '../lib/markdown'
import type { PublicClubEvent, SignupStatus } from '../types'

function EventDetailModal({
  event,
  onClose,
  onOpenSignup,
  onManageSignup,
}: {
  event: PublicClubEvent
  onClose: () => void
  onOpenSignup: (e: PublicClubEvent) => void
  onManageSignup: (e: PublicClubEvent, signupId: number, status: SignupStatus | null) => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const { spotsLeft, isFull, joinsWaitlist, verb } = getSignupState(event)
  const mySignupId = event.my_signup_id
  const myStatus: SignupStatus | null = event.my_signup_status
  const tags = event.tags
    ? event.tags.split(',').map((t) => t.trim()).filter(Boolean)
    : []

  return (
    <div className="signup-overlay" role="dialog" aria-modal="true" aria-label={event.title} onClick={onClose}>
      <div className="signup-modal event-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="signup-modal-hd">
          <div>
            <p className="signup-eyebrow">{EVENT_TYPE_LABELS[event.event_type] ?? event.event_type}</p>
            <h4>{event.title}</h4>
          </div>
          <button className="signup-close" type="button" aria-label="Close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="event-detail-meta">
          <div>{formatEventDate(event.start_time)}</div>
          <div>{formatTimeRange(event)}</div>
          {event.location_name && (
            <div>
              {event.location_name}
              {event.location_address && (
                <>
                  {' · '}
                  <a href={directionsUrl(event.location_address)} target="_blank" rel="noreferrer" className="directions-link">
                    Directions
                  </a>
                </>
              )}
            </div>
          )}
        </div>

        {tags.length > 0 && (
          <div className="event-card-tags">
            {tags.map((t) => (
              <span className="tag-chip" key={t}>
                {t}
              </span>
            ))}
          </div>
        )}

        {event.status === 'cancelled' && <p className="event-card-desc">This event has been cancelled.</p>}
        {event.status !== 'cancelled' && event.description && (
          <div className="event-detail-desc">{renderMarkdown(event.description)}</div>
        )}

        {event.status !== 'cancelled' && event.signup_enabled && (
          <div className="event-card-signup">
            <span className="event-card-signup-status">
              <b>{event.signup_count}</b> {verb === 'RSVP' ? 'going' : 'signed up'}
              {spotsLeft !== null && !isFull && <span className="cap-chip">{spotsLeft} left</span>}
              {isFull && !joinsWaitlist && <span className="full-chip">full</span>}
              {joinsWaitlist && <span className="cap-chip">waitlist open</span>}
            </span>
            {mySignupId ? (
              <button className="btn btn-outline" type="button" onClick={() => onManageSignup(event, mySignupId, myStatus)}>
                {myStatus === 'pending'
                  ? 'Request pending · Manage'
                  : myStatus === 'denied'
                    ? 'Not approved · Manage'
                    : myStatus === 'waitlist'
                      ? 'On waitlist · Manage'
                      : "You’re going · Manage"}
              </button>
            ) : (
              <button
                className={isFull && !joinsWaitlist ? 'btn btn-outline' : 'btn btn-ace'}
                type="button"
                disabled={isFull && !joinsWaitlist}
                onClick={() => onOpenSignup(event)}
              >
                {joinsWaitlist ? 'Join waitlist' : isFull ? 'Full' : verb}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default EventDetailModal
