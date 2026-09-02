import type {
  AdminEventRow,
  AuditEntry,
  BoardMember,
  EventSignup,
  FormFieldInput,
  FormTemplate,
  FormWithFields,
  LaundryItem,
  LoginSettings,
  MediaItem,
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
    decideSignup: (eventId: number, signupId: number, status: Extract<SignupStatus, 'approved' | 'denied'>) =>
      request<{ ok: true }>(`/api/admin/events/${eventId}/signups/${signupId}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }),
    removeSignup: (eventId: number, signupId: number) =>
      request<{ ok: true }>(`/api/admin/events/${eventId}/signups/${signupId}`, { method: 'DELETE' }),
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
  laundry: {
    list: () => request<{ items: LaundryItem[] }>('/api/admin/laundry'),
    create: (name: string) =>
      request<{ id: number }>('/api/admin/laundry', { method: 'POST', body: JSON.stringify({ name }) }),
    update: (id: number, input: Partial<Pick<LaundryItem, 'name' | 'stage' | 'sort_order'>>) =>
      request<{ ok: true }>(`/api/admin/laundry/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
    remove: (id: number) => request<{ ok: true }>(`/api/admin/laundry/${id}`, { method: 'DELETE' }),
    cleanAll: () => request<{ ok: true; count: number }>('/api/admin/laundry/clean-all', { method: 'POST' }),
  },
  media: {
    list: () => request<{ media: MediaItem[] }>('/api/admin/media'),
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
