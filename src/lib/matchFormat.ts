import type { EventMatch } from '../types'

const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
export function slotTime(iso: string | null) {
  return iso ? timeFmt.format(new Date(iso)) : ''
}

export function scoreLine(m: EventMatch): string | null {
  if (m.forfeit_team_id != null) return 'Forfeit'
  if (!m.scores || m.scores.length === 0) return null
  return m.scores.map(([a, b]) => `${a}–${b}`).join(', ')
}
