import type {
  AuthUser,
  BoardMember,
  FormWithFields,
  MediaItem,
  MemberSummary,
  MyProfile,
  Player,
  PublicClubEvent,
  PublicMemberProfile,
  SignupStatus,
  SkillLevel,
} from '../types'
import type { LoginProviders } from './signInOptions'

// Carries the HTTP status so callers can branch on it (e.g. 404 vs. a real
// outage) instead of sniffing the message string.
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'include' })
  if (!res.ok) throw new ApiError(res.status, `${path} responded ${res.status}`)
  return res.json() as Promise<T>
}

export function getRoster(season?: string): Promise<{ players: Player[]; visible: boolean }> {
  return getJson(season ? `/api/roster?season=${encodeURIComponent(season)}` : '/api/roster')
}

export function getBoard(season?: string): Promise<{ board: BoardMember[] }> {
  return getJson(season ? `/api/board?season=${encodeURIComponent(season)}` : '/api/board')
}

export function getEvents(opts?: { past?: boolean }): Promise<{ events: PublicClubEvent[] }> {
  return getJson(opts?.past ? '/api/events?past=1' : '/api/events')
}

export function getEvent(id: number): Promise<{ event: PublicClubEvent }> {
  return getJson(`/api/events/${id}`)
}

export function getForm(id: number): Promise<{ form: FormWithFields }> {
  return getJson(`/api/forms/${id}`)
}

export async function submitSignup(
  eventId: number,
  input: {
    name: string
    email: string
    answers: Record<string, string>
    company?: string
  }
): Promise<{ id: number; cancel_token: string; status: SignupStatus }> {
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
  return res.json() as Promise<{ id: number; cancel_token: string; status: SignupStatus }>
}

export async function cancelSignup(eventId: number, signupId: number, token?: string): Promise<void> {
  const query = token ? `?token=${encodeURIComponent(token)}` : ''
  const res = await fetch(`/api/events/${eventId}/signups/${signupId}${query}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string })
    throw new Error(body.error || `Cancel failed (${res.status})`)
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

export function getProfile(): Promise<{ profile: MyProfile }> {
  return getJson('/api/profile')
}

export async function updateSkillLevel(skillLevel: SkillLevel | null): Promise<void> {
  const res = await fetch('/api/profile', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ skill_level: skillLevel }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string })
    throw new Error(body.error || `Update failed (${res.status})`)
  }
}

export function getMembers(): Promise<{ members: MemberSummary[] }> {
  return getJson('/api/members')
}

export function getMemberProfile(id: number): Promise<{ member: PublicMemberProfile }> {
  return getJson(`/api/members/${id}`)
}

export function getLoginProviders(): Promise<LoginProviders> {
  return getJson('/api/auth/providers')
}
