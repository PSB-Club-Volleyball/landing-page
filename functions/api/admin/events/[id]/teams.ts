import type { Env } from '../../../_lib/env'
import { badRequest, json, notFound } from '../../../_lib/http'
import type { AdminData } from '../../_lib/types'
import { logAudit } from '../../_lib/audit'

const FORMATS = ['none', 'round_robin', 'pool_bracket', 'single_elim', 'double_elim'] as const
type PlayFormat = (typeof FORMATS)[number]

interface TeamRow {
  id: number
  name: string
  seed: number
  pool: string | null
  published: number
}
interface MemberRow {
  id: number
  team_id: number
  signup_id: number | null
  display_name: string | null
  signup_name: string | null
  is_captain: number
}

// GET /api/admin/events/:id/teams -> the event's chosen format, its teams
// (with members), and the pool of people who can be placed on a team (the
// approved signups).
export const onRequestGet: PagesFunction<Env, 'id', AdminData> = async ({ env, params }) => {
  const eventId = Number(params.id)
  if (!Number.isInteger(eventId)) return badRequest('Invalid id')

  const event = await env.DB.prepare(`SELECT play_format, format_config FROM events WHERE id = ?1`)
    .bind(eventId)
    .first<{ play_format: string | null; format_config: string | null }>()
  if (!event) return notFound('Event not found')

  const participants = await env.DB.prepare(
    `SELECT id AS signup_id, name, email, checked_in_at
     FROM event_signups WHERE event_id = ?1 AND status = 'approved'
     ORDER BY name COLLATE NOCASE`
  )
    .bind(eventId)
    .all<{ signup_id: number; name: string; email: string; checked_in_at: string | null }>()

  const teamRows = await env.DB.prepare(
    `SELECT id, name, seed, pool, published FROM event_teams WHERE event_id = ?1 ORDER BY seed, id`
  )
    .bind(eventId)
    .all<TeamRow>()

  const teamIds = (teamRows.results ?? []).map((t) => t.id)
  let memberRows: MemberRow[] = []
  if (teamIds.length > 0) {
    const placeholders = teamIds.map((_, i) => `?${i + 1}`).join(', ')
    const res = await env.DB.prepare(
      `SELECT m.id, m.team_id, m.signup_id, m.display_name, m.is_captain, s.name AS signup_name
       FROM event_team_members m
       LEFT JOIN event_signups s ON s.id = m.signup_id
       WHERE m.team_id IN (${placeholders})
       ORDER BY m.id`
    )
      .bind(...teamIds)
      .all<MemberRow>()
    memberRows = res.results ?? []
  }

  const teams = (teamRows.results ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    seed: t.seed,
    pool: t.pool,
    published: Boolean(t.published),
    members: memberRows
      .filter((m) => m.team_id === t.id)
      .map((m) => ({
        id: m.id,
        signup_id: m.signup_id,
        display_name: m.display_name,
        name: m.display_name || m.signup_name || 'Unknown',
        is_captain: Boolean(m.is_captain),
      })),
  }))

  return json({
    play_format: event.play_format,
    format_config: event.format_config ? JSON.parse(event.format_config) : null,
    published: teams.length > 0 && teams.every((t) => t.published),
    teams,
    participants: (participants.results ?? []).map((p) => ({
      signup_id: p.signup_id,
      name: p.name,
      email: p.email,
      checked_in: p.checked_in_at !== null,
    })),
  })
}

interface TeamsInput {
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

function validateShape(body: unknown): TeamsInput | string {
  if (!body || typeof body !== 'object') return 'Invalid body'
  const b = body as Record<string, unknown>
  if (!FORMATS.includes(b.play_format as PlayFormat)) return 'Unknown play_format'
  if (b.format_config == null || typeof b.format_config !== 'object') return 'format_config must be an object'
  if (typeof b.published !== 'boolean') return 'published must be a boolean'
  if (!Array.isArray(b.teams)) return 'teams must be an array'
  for (const t of b.teams as Record<string, unknown>[]) {
    if (typeof t.name !== 'string' || !t.name.trim()) return 'Every team needs a name'
    if (!Array.isArray(t.members)) return 'team.members must be an array'
    for (const m of t.members as Record<string, unknown>[]) {
      const hasSignup = typeof m.signup_id === 'number'
      const hasName = typeof m.display_name === 'string' && m.display_name.trim().length > 0
      if (hasSignup === hasName) return 'Each member needs exactly one of signup_id or display_name'
    }
  }
  return body as TeamsInput
}

// PUT /api/admin/events/:id/teams -> replace the event's format + full team
// set. The client owns team-building (shuffle, manual moves); the server
// persists the desired state wholesale, in one atomic batch.
export const onRequestPut: PagesFunction<Env, 'id', AdminData> = async ({ request, env, params, data }) => {
  const eventId = Number(params.id)
  if (!Number.isInteger(eventId)) return badRequest('Invalid id')

  const exists = await env.DB.prepare(`SELECT 1 FROM events WHERE id = ?1`).bind(eventId).first()
  if (!exists) return notFound('Event not found')

  const parsed = validateShape(await request.json().catch(() => null))
  if (typeof parsed === 'string') return badRequest(parsed)

  // Every linked member must be an approved signup for THIS event, and can
  // appear on only one team.
  const approved = await env.DB.prepare(
    `SELECT id FROM event_signups WHERE event_id = ?1 AND status = 'approved'`
  )
    .bind(eventId)
    .all<{ id: number }>()
  const approvedIds = new Set((approved.results ?? []).map((r) => r.id))
  const seenSignupIds = new Set<number>()
  for (const t of parsed.teams) {
    if (parsed.published && t.members.length === 0) return badRequest('A published team set can’t contain an empty team')
    for (const m of t.members) {
      if (typeof m.signup_id === 'number') {
        if (!approvedIds.has(m.signup_id)) return badRequest('A team member is not an approved signup for this event')
        if (seenSignupIds.has(m.signup_id)) return badRequest('A person is on more than one team')
        seenSignupIds.add(m.signup_id)
      }
    }
  }

  const publishedFlag = parsed.published ? 1 : 0
  const statements = [
    env.DB.prepare(
      `UPDATE events SET play_format = ?1, format_config = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3`
    ).bind(parsed.play_format, JSON.stringify(parsed.format_config), eventId),
    env.DB.prepare(
      `DELETE FROM event_team_members WHERE team_id IN (SELECT id FROM event_teams WHERE event_id = ?1)`
    ).bind(eventId),
    env.DB.prepare(`DELETE FROM event_teams WHERE event_id = ?1`).bind(eventId),
  ]
  // Seeds are assigned here (1..N), not trusted from the client, so members
  // can be inserted against their team by (event_id, seed) within the batch.
  parsed.teams.forEach((t, i) => {
    const seed = i + 1
    statements.push(
      env.DB.prepare(
        `INSERT INTO event_teams (event_id, name, seed, pool, published) VALUES (?1, ?2, ?3, ?4, ?5)`
      ).bind(eventId, t.name.trim(), seed, t.pool ?? null, publishedFlag)
    )
    for (const m of t.members) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO event_team_members (team_id, signup_id, display_name, is_captain)
           SELECT id, ?1, ?2, ?3 FROM event_teams WHERE event_id = ?4 AND seed = ?5`
        ).bind(
          typeof m.signup_id === 'number' ? m.signup_id : null,
          typeof m.display_name === 'string' && m.display_name.trim() ? m.display_name.trim() : null,
          m.is_captain ? 1 : 0,
          eventId,
          seed
        )
      )
    }
  })

  await env.DB.batch(statements)

  await logAudit(env, data.user.id, 'update', 'event_teams', eventId, {
    play_format: parsed.play_format,
    team_count: parsed.teams.length,
    published: parsed.published,
  })
  return json({ ok: true })
}
