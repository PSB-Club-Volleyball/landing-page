import type { AuthUser, BoardMember, ClubEvent, MediaItem, Player } from '../types'

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

export function getEvents(): Promise<{ events: ClubEvent[] }> {
  return getJson('/api/events')
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
