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
  email?: string | null // admin roster only — from the linked account (user_id); absent from the public roster
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
export type EventVisibility = 'public' | 'club' | 'eboard'
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
  // Who can see this event on the public site: everyone, club members and
  // above, or admins/owners only (e-board). Independent of status.
  visibility: EventVisibility
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
  // Comma-separated SkillLevel values this event's RSVP is restricted to.
  // NULL/empty means every skill level (including unset) may sign up.
  allowed_skill_levels: string | null
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
  // Also single-event only: the chosen format and, once teams are published,
  // the schedule + standings for the "Scores" / "Schedule" tab.
  play_format?: PlayFormat | null
  schedule_config?: ScheduleConfig | null
  matches?: EventMatch[]
  standings?: StandingRow[]
  pools?: PoolStanding[]
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
  // True when a schedule already exists — re-saving teams clears it.
  has_schedule: boolean
  teams: EventTeam[]
  participants: TeamParticipant[]
}

// Schedule knobs for a scored format, stored inside events.format_config
// alongside team_count.
export interface ScheduleConfig {
  courts: number
  sets_per_match: 1 | 3 | 5
  // Whole minutes the whole event runs for; match start times are spread
  // evenly across it (start_time .. start_time + total_minutes).
  total_minutes: number
  // No score entry — the event just publishes the rotation with courts and
  // times. Standings are hidden.
  timed_only: boolean
  // Round robin only: every pairing plays twice.
  double_round_robin: boolean
  // Pool play → bracket only.
  pools: number
  advance_per_pool: number
  // Pool play → bracket, and stand-alone brackets: single or double elimination.
  bracket_stage: 'single' | 'double'
}

// Where a knockout match's winner or loser is routed. `side` 0 fills the
// target's team_a, 1 fills team_b. null throughout for round-robin/pool
// matches and for bracket leaves (a final; a losers-bracket exit).
export interface BracketTarget {
  bracket: string
  round: number
  slot: number
  side: 0 | 1
}

export interface EventMatch {
  id: number
  // 'pool' (round robin), 'winners' / 'losers' (bracket sides), 'final'
  // (grand final; round 1 is the title match, round 2 the reset game).
  bracket: string
  // Pool label ('A', 'B', …) for a pool-play match; null for a bracket match.
  pool: string | null
  round: number
  slot: number
  court: string | null
  team_a_id: number | null
  team_b_id: number | null
  team_a_name: string | null
  team_b_name: string | null
  scores: [number, number][] | null
  forfeit_team_id: number | null
  winner_id: number | null
  winner_to: BracketTarget | null
  loser_to: BracketTarget | null
  // Wall-clock start, derived from the event start + the slot's share of
  // total_minutes.
  start_time: string | null
}

export interface StandingRow {
  team_id: number
  name: string
  played: number
  wins: number
  losses: number
  sets_won: number
  sets_lost: number
  points_for: number
  points_against: number
}

// One pool's ranked table plus whether every match in it has a result.
export interface PoolStanding {
  label: string
  standings: StandingRow[]
  complete: boolean
}

export interface MatchesResponse {
  config: ScheduleConfig
  teams: { id: number; name: string; pool: string | null; seed: number }[]
  matches: EventMatch[]
  // Single round robin: the one table. Pool play: empty (see `pools`).
  standings: StandingRow[]
  // Pool play: one entry per pool. Empty otherwise.
  pools: PoolStanding[]
}

export interface ScheduleInput {
  config: ScheduleConfig
  matches: {
    // 'pool' for round robin (with `pool` set to the label); 'winners' /
    // 'losers' / 'final' for a bracket.
    bracket: string
    pool?: string | null
    round: number
    slot: number
    court: string | null
    team_a_id: number | null
    team_b_id: number | null
    // Pre-decided result, only used for bracket byes on generate.
    winner_id?: number | null
    // Knockout advancement wiring (single- and double-elim). Absent for
    // round robin.
    winner_to?: BracketTarget | null
    loser_to?: BracketTarget | null
  }[]
}

export interface MatchResultInput {
  scores: [number, number][] | null
  forfeit_team_id: number | null
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
  play_format: PlayFormat | null
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

// Hierarchical, not independent flags: each tier includes the permissions
// of the ones below it — outsider < club_member < admin < owner.
export type UserRole = 'outsider' | 'club_member' | 'admin' | 'owner'
export type Team = 'A' | 'B'
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced'

export interface AuthUser {
  email: string
  name: string | null
  avatarUrl: string | null
  provider: string
  role: UserRole
  waiverSignedYear: number | null
}

export interface LoginSettings {
  google_enabled: boolean
  microsoft_enabled: boolean
  microsoft_other_enabled: boolean
  current_season: string | null
  roster_visible: boolean
}

export interface AdminUser {
  id: number
  email: string
  name: string | null
  avatar_url: string | null
  provider: string
  role: UserRole
  position: string | null
  team: Team | null
  skill_level: SkillLevel | null
  skill_level_locked: boolean
  waiver_signed_year: number | null
  waiver_signed_at: string | null
  dues_paid_year: number | null
  dues_paid_at: string | null
  // Flagged by an admin (e.g. repeated no-shows/late cancellations) so this
  // person's signups never auto-confirm — see events/[id]/signups.ts.
  rsvp_restricted: boolean
  created_at: string
}

export interface PlayerResult {
  eventId: number
  title: string
  startTime: string
  teamName: string
  wins: number
  losses: number
  setsWon: number
  setsLost: number
}

// GET /api/profile — the signed-in user's own account page. `status`
// applies to every account regardless of role; `club` is null for outsiders
// (nothing to show until they're an approved club member).
export interface MyProfile {
  account: {
    name: string | null
    email: string
    avatarUrl: string | null
    provider: string
    role: UserRole
  }
  status: {
    skillLevel: SkillLevel | null
    skillLevelLocked: boolean
    waiverSignedYear: number | null
    rsvpRestricted: boolean
  }
  club: {
    position: string | null
    team: Team | null
    duesPaidYear: number | null
    duesPaidAt: string | null
    roster: { season: string; jerseyNumber: number | null; classYear: string | null } | null
  } | null
  upcomingRsvps: {
    signupId: number
    eventId: number
    title: string
    startTime: string
    locationName: string | null
    status: SignupStatus
  }[]
  results: PlayerResult[]
}

// GET /api/members — public results-only leaderboard entry. Never carries
// skill level or club status.
export interface MemberSummary {
  id: number
  name: string | null
  avatarUrl: string | null
  wins: number
  losses: number
  setsWon: number
  setsLost: number
  winPct: number
  currentStreak: number
}

// GET /api/members/:id — one account's public profile.
export interface PublicMemberProfile {
  id: number
  name: string | null
  avatarUrl: string | null
  position: string | null
  team: string | null
  classYear: string | null
  jerseyNumber: number | null
  summary: {
    wins: number
    losses: number
    setsWon: number
    setsLost: number
    winPct: number
    currentStreak: number
  }
  results: PlayerResult[]
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
