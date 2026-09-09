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
  user_id: number | null // set when this row was auto-added from an approved club member/admin account
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
export type SignupStatus = 'pending' | 'approved' | 'denied' | 'waitlist'

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
  tags: string | null // comma-separated, admin-entered
  // Optional cutoff after which signup closes even though the event hasn't
  // started yet — same "YYYY-MM-DDTHH:MM" wall-clock format as start_time.
  // NULL means signup stays open until the event starts.
  signup_deadline: string | null
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
  // Set by GET /api/events/:id (the single-event page), not the list. Holds
  // the published teams, if any — drives the public "Teams" tab. Members
  // carry no contact info.
  teams?: PublicEventTeam[]
}

// How an event is contested once teams are formed. 'none' means teams only —
// no schedule, bracket, or scores. The other formats' schedule/score UI
// arrives in a later change; for now picking one just records the intent.
export type PlayFormat = 'none' | 'round_robin' | 'pool_bracket' | 'single_elim' | 'double_elim'

export interface PublicEventTeamMember {
  name: string
  is_captain: boolean
}
export interface PublicEventTeam {
  id: number
  name: string
  seed: number
  pool: string | null
  members: PublicEventTeamMember[]
}

// Admin view of one team member: either a linked signup (signup_id set) or a
// walk-in (signup_id null, display_name set). `name` is always resolved for
// display.
export interface EventTeamMember {
  id: number
  signup_id: number | null
  display_name: string | null
  name: string
  is_captain: boolean
}
export interface EventTeam {
  id: number
  name: string
  seed: number
  pool: string | null
  published: boolean
  members: EventTeamMember[]
}

// A person eligible to be placed on a team: an approved signup for the event.
export interface TeamParticipant {
  signup_id: number
  name: string
  email: string
  checked_in: boolean
}

// What the admin Teams tab sends back — the full desired state, which the
// server replaces wholesale.
export interface TeamsInput {
  play_format: PlayFormat
  format_config: Record<string, unknown>
  published: boolean
  teams: {
    name: string
    seed: number
    pool: string | null
    members: { signup_id: number | null; display_name: string | null; is_captain: boolean }[]
  }[]
}

export interface TeamsResponse {
  play_format: PlayFormat | null
  format_config: Record<string, unknown> | null
  published: boolean
  teams: EventTeam[]
  participants: TeamParticipant[]
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
  // Overrides the "series occurrences hide until 7 days out" rule (see
  // functions/api/events.ts) for this one occurrence — admin-only, like
  // series_id.
  released_early: boolean
}

export type FieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox_group'
  | 'number'
  | 'checkbox'
  | 'date'
  | 'time'
  | 'email'
  | 'phone'
  | 'linear_scale'
  | 'section'

export interface FormField {
  id: number
  form_id: number
  label: string
  field_type: FieldType
  options: string | null // choices separated by "|" — 'select' | 'radio' | 'checkbox_group' only
  required: boolean
  sort_order: number
  description: string | null // optional help text shown under the label
  min_value: number | null // text/textarea: min length; number/linear_scale: min value
  max_value: number | null // text/textarea: max length; number/linear_scale: max value
  pattern: string | null // regex the answer must match (text/email/phone)
}

export interface FormTemplate {
  id: number
  name: string
  created_at: string
  updated_at: string
  used_count: number
  field_count: number
  max_responses: number | null
  confirmation_message: string | null
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
  description: string | null
  min_value: number | null
  max_value: number | null
  pattern: string | null
}

export interface EventSignup {
  id: number
  event_id: number
  name: string
  email: string
  answers: Record<string, string> | null
  status: SignupStatus
  checked_in_at: string | null
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
  current_season: string | null
  roster_visible: boolean
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
  // Flagged by an admin (e.g. repeated no-shows/late cancellations) so this
  // person's signups never auto-confirm — see events/[id]/signups.ts.
  rsvp_restricted: boolean
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
