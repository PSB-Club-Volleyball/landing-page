import type { AuthUser, BoardMember, FormWithFields, MediaItem, Player, PublicClubEvent } from '../types'

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'include' })
  if (!res.ok) throw new Error(`${path} responded ${res.status}`)
  return res.json() as Promise<T>
}

export function getRoster(season?: string): Promise<{ players: Player[] }> {
  return getJson(season ? `/api/roster?season=${encodeURIComponent(season)}` : '/api/roster')
}

export function getBoard(season?: string): Promise<{ board: BoardMember[] }> {
  return getJson(season ? `/api/board?season=${encodeURIComponent(season)}` : '/api/board')
}

export function getEvents(): Promise<{ events: PublicClubEvent[] }> {
  return getJson('/api/events')
}

export function getForm(id: number): Promise<{ form: FormWithFields }> {
  return getJson(`/api/forms/${id}`)
}

export async function submitSignup(
  eventId: number,
  input: { name: string; email: string; answers: Record<string, string>; company?: string }
): Promise<void> {
  const res = await fetch(`/api/events/${eventId}/signups`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string })
    throw new Error(body.error || `Signup failed (${res.status})`)
  }
}

export function getMedia(eventId?: number): Promise<{ media: MediaItem[] }> {
  return getJson(eventId ? `/api/media?event_id=${eventId}` : '/api/media')
}

export function mediaUrl(r2Key: string): string {
  return `/api/media/file/${r2Key}`
}

export function getMe(): Promise<{ user: AuthUser | null }> {
  return getJson('/api/auth/me')
}
