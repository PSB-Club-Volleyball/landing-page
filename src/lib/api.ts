import type {
  AuthUser,
  EventStripes,
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
  StripeSkill,
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

// Every public write goes through here: a non-2xx throws the server's
// `error` message, else `${failure} (status)` (or `${path} responded status`
// when no failure label is given). Any write may change the session, so once
// it lands the cached auth answers are dropped.
async function send(method: string, path: string, body?: unknown, failure?: string): Promise<Response> {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  clearAuthCaches()
  if (!res.ok) {
    const err = await res.json().catch(() => ({}) as { error?: string })
    throw new ApiError(res.status, err.error || (failure ? `${failure} (${res.status})` : `${path} responded ${res.status}`))
  }
  return res
}

// A GET memoized for `ttlMs`, sharing the in-flight request so concurrent
// callers don't double-fetch. A failed request is dropped so the next call
// retries instead of replaying the error.
function cachedGet<T>(path: string, ttlMs: number) {
  let entry: { promise: Promise<T>; expiresAt: number } | null = null
  return {
    get(): Promise<T> {
      if (entry && entry.expiresAt > Date.now()) return entry.promise
      const promise = getJson<T>(path)
      promise.catch(() => {
        if (entry?.promise === promise) entry = null
      })
      entry = { promise, expiresAt: Date.now() + ttlMs }
      return promise
    },
    clear() {
      entry = null
    },
  }
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
  const res = await send('POST', `/api/events/${eventId}/signups`, input, 'Signup failed')
  return res.json() as Promise<{ id: number; cancel_token: string; status: SignupStatus }>
}

export async function cancelSignup(eventId: number, signupId: number, token?: string): Promise<void> {
  const query = token ? `?token=${encodeURIComponent(token)}` : ''
  await send('DELETE', `/api/events/${eventId}/signups/${signupId}${query}`, undefined, 'Cancel failed')
}

export function getMedia(eventId?: number): Promise<{ media: MediaItem[] }> {
  return getJson(eventId ? `/api/media?event_id=${eventId}` : '/api/media')
}

export function mediaUrl(r2Key: string): string {
  return `/api/media/file/${r2Key}`
}

// Navbar, the Events page, SignupModal and AdminGate all ask on mount, often
// at the same moment. Kept short, and cleared after every write (send() here,
// request() in adminApi); sign-in and sign-out both end in a full page load,
// which starts with an empty cache anyway.
const meCache = cachedGet<{ user: AuthUser | null }>('/api/auth/me', 10_000)

export function getMe(): Promise<{ user: AuthUser | null }> {
  return meCache.get()
}

// Also called by adminApi on every admin write: an edit can change the
// signed-in account (role, name, waiver) or which sign-in providers are on.
export function clearAuthCaches(): void {
  meCache.clear()
  providersCache.clear()
}

export async function logout(): Promise<{ ok: true }> {
  const res = await send('POST', '/api/auth/logout')
  return res.json() as Promise<{ ok: true }>
}

export function getProfile(): Promise<{ profile: MyProfile }> {
  return getJson('/api/profile')
}

export async function updateSkillLevel(skillLevel: SkillLevel | null): Promise<void> {
  await send('PATCH', '/api/profile', { skill_level: skillLevel }, 'Update failed')
}

// People and Leaderboard both load the full member list on mount, so
// switching between them (or revisiting either) would otherwise refetch
// the same data every time. Cache it in memory for a short window and
// share the in-flight request so concurrent callers don't double-fetch.
const membersCache = cachedGet<{ members: MemberSummary[] }>('/api/members', 60_000)

export function getMembers(): Promise<{ members: MemberSummary[] }> {
  return membersCache.get()
}

export function getEventStripes(eventId: number): Promise<EventStripes> {
  return getJson(`/api/events/${eventId}/stripes`)
}

// Award (award=true) or take back one stripe. Throws with the server's
// reason (window locked, not a teammate, …) so the page can show it.
export async function setStripe(eventId: number, receiverId: number, skill: StripeSkill, award: boolean): Promise<void> {
  await send(award ? 'POST' : 'DELETE', `/api/events/${eventId}/stripes`, { receiver_id: receiverId, skill }, 'Kudos update failed')
}

export function getMemberProfile(id: number): Promise<{ member: PublicMemberProfile }> {
  return getJson(`/api/members/${id}`)
}

// Which sign-in buttons to show; the Navbar and SignupModal both ask.
const providersCache = cachedGet<LoginProviders>('/api/auth/providers', 60_000)

export function getLoginProviders(): Promise<LoginProviders> {
  return providersCache.get()
}
