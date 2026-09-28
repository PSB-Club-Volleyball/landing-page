import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, getEventStripes, setStripe } from '../lib/api'
import { STRIPE_LABELS, STRIPE_SKILLS, STRIPE_TRAITS, stripeCount } from '../lib/stripes'
import type { EventStripes as EventStripesData, StripeSkill } from '../types'

const timeFormatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
const dayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short' })

// When the open window closes, with the day unless it's today:
// "11:28 AM", "11:28 AM tomorrow", or "Sat 11:28 AM".
function formatCloseTime(closes: Date, now: Date): string {
  const time = timeFormatter.format(closes)
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  // Rounded: a DST change makes one calendar day 23 or 25 hours long.
  const days = Math.round((midnight(closes) - midnight(now)) / 86_400_000)
  if (days === 0) return time
  if (days === 1) return `${time} tomorrow`
  return `${weekdayFormatter.format(closes)} ${time}`
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// The event page's Stripes tab: while the window is open (event start
// through 12 hours after it ends), a player awards linked teammates a
// stripe per skill with one tap, and takes it back with another. After
// that it shows what they earned and awarded. Every rule is enforced by
// functions/api/events/[id]/stripes.ts; this only mirrors it.
export default function EventStripes({ eventId }: { eventId: number }) {
  const [data, setData] = useState<EventStripesData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [openMate, setOpenMate] = useState<number | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setLoadError(null)
    setActionError(null)
    getEventStripes(eventId)
      .then((res) => {
        if (cancelled) return
        setData(res)
        setOpenMate(res.teammates[0]?.user_id ?? null)
      })
      .catch((e: Error) => {
        if (cancelled) return
        setLoadError(e instanceof ApiError && e.status === 401 ? 'Sign in to give your teammates kudos.' : e.message)
      })
    return () => {
      cancelled = true
    }
  }, [eventId])

  async function toggle(receiverId: number, skill: StripeSkill, award: boolean) {
    const key = `${receiverId}:${skill}`
    setBusy(key)
    setActionError(null)
    try {
      await setStripe(eventId, receiverId, skill, award)
      setData((prev) =>
        prev && {
          ...prev,
          teammates: prev.teammates.map((t) =>
            t.user_id !== receiverId
              ? t
              : { ...t, given: award ? [...t.given, skill] : t.given.filter((s) => s !== skill) }
          ),
        }
      )
    } catch (e) {
      setActionError((e as Error).message)
      // The server's view won (already awarded elsewhere, window just
      // locked, …): reload so the chips and window match it.
      try {
        setData(await getEventStripes(eventId))
      } catch (reloadError) {
        setActionError(`${(e as Error).message} — and reloading failed: ${(reloadError as Error).message}`)
      }
    } finally {
      setBusy(null)
    }
  }

  if (loadError) return <p className="placeholder-note">{loadError}</p>
  if (!data) return <p>Loading&hellip;</p>

  const { window: win, team, teammates, received } = data
  const closes = new Date(win.closes_at)

  if (!team) {
    return (
      <p className="placeholder-note">
        Kudos are given between teammates. You weren&rsquo;t listed on a team for this event.
      </p>
    )
  }

  if (win.state === 'upcoming') {
    return (
      <p className="placeholder-note">
        Kudos open when the event starts. You&rsquo;ll have until {timeFormatter.format(closes)},{' '}
        {dayFormatter.format(closes)} to give them.
      </p>
    )
  }

  if (win.state === 'closed') {
    const given = teammates.filter((t) => t.given.length > 0)
    const receivedCounts = [...STRIPE_SKILLS, ...STRIPE_TRAITS]
      .map((skill) => ({ skill, n: received.filter((r) => r.skill === skill).length }))
      .filter((c) => c.n > 0)
    const fromNames = [
      ...new Set(received.map((r) => (r.from_user_id === null ? 'a former member' : r.from_name || 'a teammate'))),
    ]
    return (
      <div className="stripes-panel">
        <div className="stripes-banner is-locked" role="status">
          <b>Kudos are locked</b>
          <span>
            Closed {timeFormatter.format(closes)}, {dayFormatter.format(closes)}, 12 hours after the event ended.
          </span>
        </div>
        <section className="stripes-summary">
          <h3>You earned {stripeCount(received.length)}</h3>
          {receivedCounts.length > 0 ? (
            <>
              <ul className="stripes-tags">
                {receivedCounts.map((c) => (
                  <li key={c.skill}>
                    {STRIPE_LABELS[c.skill]} &times;{c.n}
                  </li>
                ))}
              </ul>
              <p className="muted-sub">from {fromNames.join(', ')}</p>
            </>
          ) : (
            <p className="muted-sub">None at this event.</p>
          )}
        </section>
        <section className="stripes-summary">
          <h3>You awarded {stripeCount(given.reduce((n, t) => n + t.given.length, 0))}</h3>
          {given.length > 0 ? (
            <ul className="stripes-given-list">
              {given.map((t) => (
                <li key={t.user_id}>
                  {t.name || 'Teammate'}: {t.given.map((s) => STRIPE_LABELS[s]).join(', ')}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-sub">None at this event.</p>
          )}
        </section>
      </div>
    )
  }

  const minutesLeft = win.closes_in_minutes
  if (minutesLeft === null) throw new Error('Open stripe window came back without closes_in_minutes')

  return (
    <div className="stripes-panel">
      <div className="stripes-banner" role="status">
        <b>Give your teammates kudos</b>
        <span>
          Closes in {formatDuration(minutesLeft)} ({formatCloseTime(closes, new Date())}). After that, kudos lock.
        </span>
      </div>
      <p className="muted-sub">
        Your team: <b>{team.name}</b> &middot; tap a skill to give kudos, tap again to take it back
      </p>
      {actionError && <p className="admin-error">{actionError}</p>}
      {teammates.length === 0 ? (
        <p className="placeholder-note">None of your teammates have an account yet, so there&rsquo;s no one to award.</p>
      ) : (
        <ul className="stripes-mates">
          {teammates.map((t) => {
            const expanded = openMate === t.user_id
            return (
              <li key={t.user_id} className={expanded ? 'is-open' : undefined}>
                <div className="stripes-mate-row">
                  <button
                    type="button"
                    className="stripes-mate-head"
                    aria-expanded={expanded}
                    onClick={() => setOpenMate(expanded ? null : t.user_id)}
                  >
                    <span className="stripes-mate-name">{t.name || 'Teammate'}</span>
                    <span className="muted-sub">{t.given.length > 0 ? stripeCount(t.given.length) : 'No kudos yet'}</span>
                  </button>
                  {expanded && (
                    <Link to={`/members/${t.user_id}`} className="stripes-profile-link">
                      View profile
                    </Link>
                  )}
                </div>
                {expanded && (
                  <div className="stripes-mate-body">
                    <div className="stripes-chips" role="group" aria-label={`Kudos for ${t.name || 'teammate'}`}>
                      {[...STRIPE_SKILLS, ...STRIPE_TRAITS].map((skill) => {
                        const on = t.given.includes(skill)
                        return (
                          <button
                            key={skill}
                            type="button"
                            aria-pressed={on}
                            className={on ? 'stripe-chip on' : 'stripe-chip'}
                            disabled={busy !== null}
                            onClick={() => toggle(t.user_id, skill, !on)}
                          >
                            {STRIPE_LABELS[skill]}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <p className="muted-sub">
        Kudos can be given once per skill per teammate per event. Your name shows on their profile. Guests without an
        account can&rsquo;t receive kudos.
      </p>
    </div>
  )
}
