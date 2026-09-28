import type { Env } from './env'
import { easternWallClock } from './time'

export const STRIPE_SKILLS = ['serving', 'passing', 'setting', 'hitting', 'blocking', 'digging', 'hustle', 'teammate'] as const
export type StripeSkill = (typeof STRIPE_SKILLS)[number]

export function isStripeSkill(value: unknown): value is StripeSkill {
  return typeof value === 'string' && (STRIPE_SKILLS as readonly string[]).includes(value)
}

const WINDOW_HOURS_AFTER_END = 12

// Event times are Eastern wall-clock "YYYY-MM-DDTHH:MM" strings (see
// ./time.ts). Arithmetic on them is done as wall-clock arithmetic: parse as
// if UTC, shift, format back. "12 hours after" therefore means 12 hours on
// the clock, which is 11 or 13 real hours across a DST change — fine here.
// Date.parse alone is too lenient (V8 reads "garbage:00Z" as the year 2000),
// so check the shape first. datetime-local inputs may carry seconds.
const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/
function parseWallClock(wallClock: string): number {
  const ms = WALL_CLOCK.test(wallClock) ? Date.parse(`${wallClock.slice(0, 16)}:00Z`) : NaN
  if (Number.isNaN(ms)) throw new Error(`Bad event time: ${wallClock}`)
  return ms
}

function addWallClockHours(wallClock: string, hours: number): string {
  return new Date(parseWallClock(wallClock) + hours * 3_600_000).toISOString().slice(0, 16)
}

function wallClockMinutesBetween(from: string, to: string): number {
  return Math.round((parseWallClock(to) - parseWallClock(from)) / 60_000)
}

export interface StripeWindow {
  opens_at: string
  closes_at: string
  state: 'upcoming' | 'open' | 'closed'
  // Only set while open, so the page can say "closes in 9h 42m".
  closes_in_minutes: number | null
}

// Stripes open when the event starts and lock 12 hours after it ends. An
// event with no end time locks 12 hours after it starts. The admin form
// stores an overnight event's end on its start date (7 PM - 12:30 AM ends
// "T00:30" the same day), so an end before the start means the next day.
export function stripeWindow(event: { start_time: string; end_time: string | null }, now = new Date()): StripeWindow {
  const nowWall = easternWallClock(now)
  parseWallClock(event.start_time)
  const opensAt = event.start_time.slice(0, 16)
  let endsAt = event.end_time === null ? opensAt : addWallClockHours(event.end_time, 0)
  if (endsAt < opensAt) endsAt = addWallClockHours(endsAt, 24)
  const closesAt = addWallClockHours(endsAt, WINDOW_HOURS_AFTER_END)
  const state = nowWall < opensAt ? 'upcoming' : nowWall < closesAt ? 'open' : 'closed'
  return {
    opens_at: opensAt,
    closes_at: closesAt,
    state,
    closes_in_minutes: state === 'open' ? wallClockMinutesBetween(nowWall, closesAt) : null,
  }
}

// The published teams in this event that the account is linked to as a
// member (event_team_members.user_id). Usually one.
export async function myTeamIds(env: Env, eventId: number, userId: number): Promise<number[]> {
  const rows = await env.DB.prepare(
    `SELECT DISTINCT et.id FROM event_team_members m
     JOIN event_teams et ON et.id = m.team_id
     WHERE et.event_id = ?1 AND et.published = 1 AND m.user_id = ?2`
  )
    .bind(eventId, userId)
    .all<{ id: number }>()
  return (rows.results ?? []).map((r) => r.id)
}

// True when both accounts are linked members of the same published team in
// this event — the only pairing that can exchange stripes.
export async function areTeammates(env: Env, eventId: number, a: number, b: number): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 FROM event_team_members ma
     JOIN event_team_members mb ON mb.team_id = ma.team_id
     JOIN event_teams et ON et.id = ma.team_id
     WHERE et.event_id = ?1 AND et.published = 1 AND ma.user_id = ?2 AND mb.user_id = ?3
     LIMIT 1`
  )
    .bind(eventId, a, b)
    .first()
  return row !== null
}

export interface MemberStripes {
  total: number
  giver_count: number
  // Every skill, zero included, in STRIPE_SKILLS order.
  counts: { skill: StripeSkill; count: number }[]
  // Newest event first: who awarded what, and where. giver_id is null when
  // the giver's account was deleted.
  awards: { giver_id: number | null; giver_name: string | null; event_id: number; event_title: string; skills: StripeSkill[] }[]
}

export async function getMemberStripes(env: Env, userId: number): Promise<MemberStripes> {
  const rows = await env.DB.prepare(
    `SELECT st.skill, st.giver_id, u.name AS giver_name, st.event_id, e.title AS event_title
     FROM stripes st
     LEFT JOIN users u ON u.id = st.giver_id
     JOIN events e ON e.id = st.event_id
     WHERE st.receiver_id = ?1
     ORDER BY e.start_time DESC, st.event_id, st.giver_id, st.id`
  )
    .bind(userId)
    .all<{ skill: StripeSkill; giver_id: number | null; giver_name: string | null; event_id: number; event_title: string }>()
  const list = rows.results ?? []

  const awards: MemberStripes['awards'] = []
  for (const r of list) {
    const last = awards[awards.length - 1]
    if (last && last.giver_id === r.giver_id && last.event_id === r.event_id) last.skills.push(r.skill)
    else awards.push({ giver_id: r.giver_id, giver_name: r.giver_name, event_id: r.event_id, event_title: r.event_title, skills: [r.skill] })
  }
  return {
    total: list.length,
    giver_count: new Set(list.map((r) => r.giver_id)).size,
    counts: STRIPE_SKILLS.map((skill) => ({ skill, count: list.filter((r) => r.skill === skill).length })),
    awards,
  }
}
