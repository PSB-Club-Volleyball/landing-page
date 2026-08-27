import { useEffect, useState } from 'react'
import Placeholder from '../components/Placeholder'
import { getEvents } from '../lib/api'
import type { ClubEvent } from '../types'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})
const timeFormatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
const monthDayFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

function formatWhen(event: ClubEvent) {
  if (event.recurrence_days) {
    const days = event.recurrence_days
      .split(',')
      .map((d) => WEEKDAY_LABELS[Number(d)])
      .join(', ')
    const start = timeFormatter.format(new Date(event.start_time))
    const time = event.end_time ? `${start} – ${timeFormatter.format(new Date(event.end_time))}` : start
    const until = event.recurrence_until
      ? ` through ${monthDayFormatter.format(new Date(`${event.recurrence_until}T00:00`))}`
      : ''
    return `Every ${days}, ${time}${until}`
  }

  const start = dateFormatter.format(new Date(event.start_time))
  if (!event.end_time) return start
  const end = timeFormatter.format(new Date(event.end_time))
  return `${start} – ${end}`
}

function Events() {
  const [events, setEvents] = useState<ClubEvent[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    getEvents()
      .then((res) => {
        if (!cancelled) setEvents(res.events)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <Placeholder
        title="Events"
        note="Couldn't load events right now &mdash; try refreshing, or check our GroupMe below."
      />
    )
  }

  if (events !== null && events.length === 0) {
    return (
      <Placeholder
        title="Events"
        note="There are no practices right now while the board decides on tryouts. In the meantime, we're holding weekly open gyms &mdash; join our GroupMe below for times and details. Tournament dates will be posted here once the season is set."
      />
    )
  }

  return (
    <main className="board">
      <h2>Events</h2>
      <ul className="events-list">
        {(events ?? []).map((event) => (
          <li key={event.id} className={event.status === 'cancelled' ? 'cancelled' : undefined}>
            <div className="event-when">{formatWhen(event)}</div>
            <div className="event-body">
              <span className="event-title">
                {event.title}
                {event.status === 'cancelled' && <span className="event-badge">Cancelled</span>}
              </span>
              {event.location_name && <span className="event-location">{event.location_name}</span>}
              {event.description && <p className="event-desc">{event.description}</p>}
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}

export default Events
