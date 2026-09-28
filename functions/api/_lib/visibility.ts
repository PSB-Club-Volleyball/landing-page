import { isAtLeast } from './roles'

export type EventVisibility = 'public' | 'club' | 'eboard'

// Who may see an event, by its visibility: 'public' is everyone, 'club' is
// club members and up, 'eboard' is admins and up. Same rule GET /api/events
// and POST /api/events/:id/signups apply inline.
export function visibilitiesFor(role: string): EventVisibility[] {
  if (isAtLeast(role, 'admin')) return ['public', 'club', 'eboard']
  if (isAtLeast(role, 'club_member')) return ['public', 'club']
  return ['public']
}

export function canSeeVisibility(role: string, visibility: string): boolean {
  return (visibilitiesFor(role) as string[]).includes(visibility)
}
