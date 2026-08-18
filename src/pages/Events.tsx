import { useEffect, useState } from 'react'
import Placeholder from '../components/Placeholder'
import { getEvents } from '../lib/api'
import type { ClubEvent } from '../types'

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

function formatWhen(event: ClubEvent) {
  const start = dateFormatter.format(new Date(event.start_time))
  if (!event.end_time) return start
  const end = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(
    new Date(event.end_time)
  )
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
