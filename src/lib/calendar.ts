import type { PublicClubEvent } from '../types'

// Wall-clock "YYYY-MM-DDTHH:MM" -> iCalendar local time "YYYYMMDDTHHMMSS".
// Event times are stored without a zone (the club is single-site, US
// Eastern); emitting them as floating local times keeps the calendar entry
// matching what the page shows.
function icsLocal(wallClock: string): string {
  const [date, time = '00:00'] = wallClock.split('T')
  return `${date.replace(/-/g, '')}T${time.replace(/:/g, '')}00`
}

function fold(line: string): string {
  // RFC 5545 lines wrap at 75 octets; continuations start with a space.
  if (line.length <= 74) return line
  const out: string[] = []
  let rest = line
  out.push(rest.slice(0, 74))
  rest = rest.slice(74)
  while (rest.length > 73) {
    out.push(' ' + rest.slice(0, 73))
    rest = rest.slice(73)
  }
  out.push(' ' + rest)
  return out.join('\r\n')
}

function esc(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

// Builds a single-event .ics file for `event` and triggers a download. End
// time falls back to two hours after the start when the event has none.
export function downloadEventIcs(event: PublicClubEvent) {
  const start = icsLocal(event.start_time)
  const end = event.end_time
    ? icsLocal(event.end_time)
    : icsLocal(
        (() => {
          const d = new Date(event.start_time)
          d.setHours(d.getHours() + 2)
          // Re-serialize back to the wall-clock shape icsLocal expects.
          const pad = (n: number) => String(n).padStart(2, '0')
          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
        })()
      )
  const location = [event.location_name, event.location_address].filter(Boolean).join(', ')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PSB Club Volleyball//Events//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:event-${event.id}@behrendclubvolleyball.org`,
    `DTSTAMP:${icsLocal(new Date().toISOString().slice(0, 16))}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    fold(`SUMMARY:${esc(event.title)}`),
    location ? fold(`LOCATION:${esc(location)}`) : null,
    event.description ? fold(`DESCRIPTION:${esc(event.description)}`) : null,
    `URL:${window.location.origin}/events/${event.id}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((l): l is string => l !== null)

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${event.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'event'}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
