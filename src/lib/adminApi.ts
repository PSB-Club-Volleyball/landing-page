import type {
  AdminEventRow,
  AuditEntry,
  BoardMember,
  EventSignup,
  FormFieldInput,
  FormTemplate,
  FormWithFields,
  LoginSettings,
  MediaItem,
  MediaType,
  PendingUser,
  Player,
  SignupStatus,
  Team,
  UserRole,
} from '../types'

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
    list: () => request<{ events: AdminEventRow[] }>('/api/admin/events'),
    create: (input: Partial<AdminEventRow>) =>
      request<{ id: number }>('/api/admin/events', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: number, input: Partial<AdminEventRow>) =>
      request<{ ok: true }>(`/api/admin/events/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
    remove: (id: number) => request<{ ok: true }>(`/api/admin/events/${id}`, { method: 'DELETE' }),
    signups: (id: number) => request<{ signups: EventSignup[] }>(`/api/admin/events/${id}/signups`),
    decideSignup: (eventId: number, signupId: number, status: Extract<SignupStatus, 'approved' | 'denied' | 'waitlist'>) =>
      request<{ ok: true }>(`/api/admin/events/${eventId}/signups/${signupId}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }),
    setCheckedIn: (eventId: number, signupId: number, checkedIn: boolean) =>
      request<{ ok: true }>(`/api/admin/events/${eventId}/signups/${signupId}`, {
        method: 'PUT',
        body: JSON.stringify({ checked_in: checkedIn }),
      }),
    removeSignup: (eventId: number, signupId: number) =>
      request<{ ok: true }>(`/api/admin/events/${eventId}/signups/${signupId}`, { method: 'DELETE' }),
    release: (eventId: number) =>
      request<{ ok: true; approved: number; waitlisted: number }>(`/api/admin/events/${eventId}/release`, {
        method: 'POST',
      }),
    announce: (eventId: number, input: { subject: string; message: string }) =>
      request<{ ok: true; recipient_count: number }>(`/api/admin/events/${eventId}/announce`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  },
  forms: {
    list: () => request<{ forms: FormTemplate[] }>('/api/admin/forms'),
    get: (id: number) => request<{ form: FormWithFields }>(`/api/admin/forms/${id}`),
    create: (input: { name: string; fields: FormFieldInput[] }) =>
      request<{ id: number }>('/api/admin/forms', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: number, input: { name: string; fields: FormFieldInput[] }) =>
      request<{ ok: true }>(`/api/admin/forms/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
    remove: (id: number) => request<{ ok: true }>(`/api/admin/forms/${id}`, { method: 'DELETE' }),
  },
  media: {
    list: () => request<{ media: MediaItem[] }>('/api/admin/media'),
    upload: (file: File | Blob, opts: { filename: string; mediaType: MediaType; eventId?: number | null; caption?: string | null }) => {
      const params = new URLSearchParams({ filename: opts.filename, media_type: opts.mediaType })
      if (opts.eventId != null) params.set('event_id', String(opts.eventId))
      if (opts.caption) params.set('caption', opts.caption)
      return request<{ id: number; r2_key: string }>(`/api/admin/media/upload?${params}`, {
        method: 'POST',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file,
      })
    },
    update: (id: number, input: { caption?: string | null; event_id?: number | null; sort_order?: number }) =>
      request<{ ok: true }>(`/api/admin/media/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
    remove: (id: number) => request<{ ok: true }>(`/api/admin/media/${id}`, { method: 'DELETE' }),
  },
  users: {
    list: () => request<{ users: PendingUser[] }>('/api/admin/users'),
    decide: (id: number, status: 'approved' | 'denied') =>
      request<{ ok: true }>(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify({ status }) }),
    update: (
      id: number,
      input: {
        role?: Exclude<UserRole, 'owner'>
        name?: string
        position?: string | null
        team?: Team | null
        waiver_signed?: boolean
        dues_paid?: boolean
        rsvp_restricted?: boolean
      }
    ) => request<{ ok: true }>(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
    transferOwnership: (toUserId: number) =>
      request<{ ok: true }>('/api/admin/owner/transfer', {
        method: 'POST',
        body: JSON.stringify({ to_user_id: toUserId }),
      }),
  },
  auditLog: {
    list: () => request<{ entries: AuditEntry[] }>('/api/admin/audit-log'),
  },
  settings: {
    get: () => request<LoginSettings>('/api/admin/settings'),
    update: (input: LoginSettings) =>
      request<{ ok: true }>('/api/admin/settings', { method: 'PUT', body: JSON.stringify(input) }),
  },
}

export function logout(): Promise<{ ok: true }> {
  return request('/api/auth/logout', { method: 'POST' })
}
