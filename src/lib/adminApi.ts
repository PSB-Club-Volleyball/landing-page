import type { AuditEntry, BoardMember, ClubEvent, MediaItem, PendingUser, Player } from '../types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string })
    throw new Error(body.error || `${path} responded ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const adminApi = {
  roster: {
    list: () => request<{ players: Player[] }>('/api/admin/roster'),
    create: (input: Partial<Player>) =>
      request<{ id: number }>('/api/admin/roster', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: number, input: Partial<Player>) =>
      request<{ ok: true }>(`/api/admin/roster/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
    remove: (id: number) => request<{ ok: true }>(`/api/admin/roster/${id}`, { method: 'DELETE' }),
  },
  board: {
    list: () => request<{ board: BoardMember[] }>('/api/admin/board'),
    create: (input: Partial<BoardMember>) =>
      request<{ id: number }>('/api/admin/board', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: number, input: Partial<BoardMember>) =>
      request<{ ok: true }>(`/api/admin/board/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
    remove: (id: number) => request<{ ok: true }>(`/api/admin/board/${id}`, { method: 'DELETE' }),
  },
  events: {
    list: () => request<{ events: ClubEvent[] }>('/api/admin/events'),
    create: (input: Partial<ClubEvent>) =>
      request<{ id: number }>('/api/admin/events', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: number, input: Partial<ClubEvent>) =>
      request<{ ok: true }>(`/api/admin/events/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
    remove: (id: number) => request<{ ok: true }>(`/api/admin/events/${id}`, { method: 'DELETE' }),
  },
  media: {
    list: () => request<{ media: MediaItem[] }>('/api/admin/media'),
    remove: (id: number) => request<{ ok: true }>(`/api/admin/media/${id}`, { method: 'DELETE' }),
  },
  users: {
    list: () => request<{ users: PendingUser[] }>('/api/admin/users'),
    decide: (id: number, status: 'approved' | 'denied') =>
      request<{ ok: true }>(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify({ status }) }),
    transferOwnership: (toUserId: number) =>
      request<{ ok: true }>('/api/admin/owner/transfer', {
        method: 'POST',
        body: JSON.stringify({ to_user_id: toUserId }),
      }),
  },
  auditLog: {
    list: () => request<{ entries: AuditEntry[] }>('/api/admin/audit-log'),
  },
}

export function logout(): Promise<{ ok: true }> {
  return request('/api/auth/logout', { method: 'POST' })
}
