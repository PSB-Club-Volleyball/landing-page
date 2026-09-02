export interface Player {
  id: number
  season: string
  first_name: string
  last_name: string
  jersey_number: number | null
  position: string | null
  class_year: string | null
  photo_key: string | null
  sort_order: number
}

export interface BoardMember {
  id: number
  season: string
  role: string
  first_name: string
  last_name: string
  email: string | null
  sort_order: number
}

export type EventStatus = 'draft' | 'published' | 'cancelled'
export type SignupStatus = 'pending' | 'approved' | 'denied'

export interface ClubEvent {
  id: number
  title: string
  description: string | null
  event_type: string
  start_time: string
  end_time: string | null
  location_name: string | null
  location_address: string | null
  status: EventStatus
  signup_enabled: boolean
  // Gated RSVP: when true, a new signup starts 'pending' until an admin
  // approves or denies it instead of being confirmed immediately.
  rsvp_gated: boolean
  form_id: number | null
  capacity: number | null
}

// Public-facing event with the signup summary the Events page needs to
// decide what to render (a plain count vs. a "spots left" chip), plus the
// visitor's own signup id/status if they're logged in and already signed up.
// signup_count only counts approved signups. Every event is a real,
// individually-dated occurrence — a recurring event just means several of
// these were created together (see AdminEventRow.series_id).
export interface PublicClubEvent extends ClubEvent {
  signup_count: number
  my_signup_id: number | null
  my_signup_status: SignupStatus | null
}

// Admin's Events-tab row: same event, joined with the attached form's name
// and its signup count for the table. series_id groups occurrence rows that
// were created together from one "repeats weekly on..." submission; it's
// admin-only bookkeeping and carries no meaning to the public page.
export interface AdminEventRow extends ClubEvent {
  form_name: string | null
  signup_count: number
  series_id: number | null
  is_past: boolean
}

export type FieldType = 'text' | 'textarea' | 'select' | 'number' | 'checkbox'

export interface FormField {
  id: number
  form_id: number
  label: string
  field_type: FieldType
  options: string | null // choices separated by "|", 'select' only
  required: boolean
  sort_order: number
}

export interface FormTemplate {
  id: number
  name: string
  created_at: string
  updated_at: string
  used_count: number
  field_count: number
}

export interface FormWithFields extends FormTemplate {
  fields: FormField[]
}

export interface FormFieldInput {
  id?: number
  label: string
  field_type: FieldType
  options: string | null
  required: boolean
  sort_order: number
}

export interface EventSignup {
  id: number
  event_id: number
  name: string
  email: string
  answers: Record<string, string> | null
  status: SignupStatus
  created_at: string
}

export type MediaType = 'photo' | 'video'

export interface MediaItem {
  id: number
  r2_key: string
  media_type: MediaType
  caption: string | null
  event_id: number | null
  width: number | null
  height: number | null
  duration_seconds: number | null
  sort_order: number
  created_at: string
}

export type UserStatus = 'pending' | 'approved' | 'denied'
// Hierarchical, not independent flags: each tier includes the permissions
// of the ones below it — outsider < club_member < admin < owner.
export type UserRole = 'outsider' | 'club_member' | 'admin' | 'owner'
export type Team = 'A' | 'B'

export interface AuthUser {
  email: string
  name: string | null
  avatarUrl: string | null
  provider: string
  status: UserStatus
  role: UserRole
  waiverSignedYear: number | null
}

export interface LoginSettings {
  google_enabled: boolean
  microsoft_enabled: boolean
}

export interface PendingUser {
  id: number
  email: string
  name: string | null
  avatar_url: string | null
  provider: string
  status: UserStatus
  role: UserRole
  position: string | null
  team: Team | null
  waiver_signed_year: number | null
  waiver_signed_at: string | null
  dues_paid_year: number | null
  dues_paid_at: string | null
  requested_at: string
  decided_at: string | null
  decided_by: number | null
}

export interface AuditEntry {
  id: number
  action: 'create' | 'update' | 'delete'
  table_name: string
  record_id: number | null
  details: string | null
  created_at: string
  actor_email: string | null
}
