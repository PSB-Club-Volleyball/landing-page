import { useEffect, useMemo, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import { distributeTeams } from '../../lib/teamBuilder'
import type { PlayFormat, TeamParticipant, TeamsResponse } from '../../types'

const FORMAT_LABELS: Record<PlayFormat, string> = {
  none: 'No format — teams only',
  round_robin: 'Round robin',
  pool_bracket: 'Pool play, then bracket',
  single_elim: 'Single elimination',
  double_elim: 'Double elimination',
}
const FORMAT_ORDER: PlayFormat[] = ['none', 'round_robin', 'pool_bracket', 'single_elim', 'double_elim']

// A local, editable team member. `key` is a stable id for React lists and for
// moving members between teams; it has no server meaning.
interface DraftMember {
  key: string
  signup_id: number | null
  display_name: string | null
  name: string
  is_captain: boolean
}
interface DraftTeam {
  name: string
  members: DraftMember[]
}

let keySeq = 0
const nextKey = () => `m${keySeq++}`

function participantToMember(p: TeamParticipant): DraftMember {
  return { key: nextKey(), signup_id: p.signup_id, display_name: null, name: p.name, is_captain: false }
}
function walkInToMember(name: string): DraftMember {
  return { key: nextKey(), signup_id: null, display_name: name, name, is_captain: false }
}

function respToTeams(resp: TeamsResponse): DraftTeam[] {
  return resp.teams.map((t) => ({
    name: t.name,
    members: t.members.map((m) => ({
      key: nextKey(),
      signup_id: m.signup_id,
      display_name: m.display_name,
      name: m.name,
      is_captain: m.is_captain,
    })),
  }))
}

export default function TeamsAdmin({
  eventId,
  onFormatChange,
}: {
  eventId: number
  // Called after a successful save so the parent can refetch the event and
  // show/hide the "Schedule & scores" tab when the format changes.
  onFormatChange?: () => void
}) {
  const [resp, setResp] = useState<TeamsResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [format, setFormat] = useState<PlayFormat>('none')
  const [teamCount, setTeamCount] = useState('2')
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const [walkIns, setWalkIns] = useState<string[]>([])
  const [newWalkIn, setNewWalkIn] = useState('')
  const [teams, setTeams] = useState<DraftTeam[]>([])
  const [published, setPublished] = useState(false)
  const [hasSchedule, setHasSchedule] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  function hydrate(data: TeamsResponse) {
    setResp(data)
    setFormat((data.play_format as PlayFormat) ?? 'none')
    const cfgCount = data.format_config && typeof data.format_config.team_count === 'number' ? data.format_config.team_count : null
    setTeams(respToTeams(data))
    setPublished(data.published)
    setHasSchedule(data.has_schedule)
    setWalkIns(
      data.teams
        .flatMap((t) => t.members)
        .filter((m) => m.signup_id === null && m.display_name)
        .map((m) => m.display_name as string)
    )
    const fallbackCount = data.teams.length || Math.max(2, Math.ceil(data.participants.length / 4)) || 2
    setTeamCount(String(cfgCount ?? fallbackCount))
  }

  function load() {
    adminApi.events
      .teams(eventId)
      .then(hydrate)
      .catch((e: Error) => {
        console.error('Failed to load teams', e)
        setLoadError(e.message)
      })
  }

  useEffect(load, [eventId])

  const includedParticipants = useMemo(
    () => (resp?.participants ?? []).filter((p) => !excluded.has(p.signup_id)),
    [resp, excluded]
  )
  const poolSize = includedParticipants.length + walkIns.length

  function toggleExcluded(signupId: number) {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(signupId)) {
        next.delete(signupId)
      } else {
        next.add(signupId)
        // Excluding someone also pulls them off whatever team they're on, so
        // the roster and the "N of M placed" count stay honest.
        setTeams((teamsPrev) =>
          teamsPrev.map((t) => ({ ...t, members: t.members.filter((m) => m.signup_id !== signupId) }))
        )
      }
      return next
    })
  }

  function removeWalkIn(index: number) {
    const name = walkIns[index]
    setWalkIns((prev) => prev.filter((_, j) => j !== index))
    setTeams((prev) =>
      prev.map((t) => ({
        ...t,
        members: t.members.filter((m) => !(m.signup_id === null && m.display_name === name)),
      }))
    )
  }

  function addWalkIn() {
    const name = newWalkIn.trim()
    if (!name) return
    if (walkIns.some((w) => w.toLowerCase() === name.toLowerCase()) || resp?.participants.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      setError(`"${name}" is already on the list.`)
      return
    }
    setWalkIns((prev) => [...prev, name])
    setNewWalkIn('')
    setError(null)
  }

  function generate() {
    if (poolSize === 0) {
      setError('Add at least one participant before generating teams.')
      return
    }
    if (teams.length > 0 && !confirm('Replace the current teams with a fresh shuffle?')) return
    const count = Math.max(1, Math.min(Number(teamCount) || 1, poolSize))
    const pool: DraftMember[] = [
      ...includedParticipants.map(participantToMember),
      ...walkIns.map(walkInToMember),
    ]
    const buckets = distributeTeams(pool, count)
    setTeams(buckets.map((members, i) => ({ name: `Team ${i + 1}`, members })))
    setError(null)
    setNote(null)
  }

  function renameTeam(idx: number, name: string) {
    setTeams((prev) => prev.map((t, i) => (i === idx ? { ...t, name } : t)))
  }
  // One captain per team: picking a new one clears the old; picking the
  // current captain again clears it.
  function setCaptain(teamIdx: number, key: string) {
    setTeams((prev) =>
      prev.map((t, i) => {
        if (i !== teamIdx) return t
        const wasCaptain = t.members.find((m) => m.key === key)?.is_captain
        return { ...t, members: t.members.map((m) => ({ ...m, is_captain: m.key === key && !wasCaptain })) }
      })
    )
  }
  function removeMember(teamIdx: number, key: string) {
    setTeams((prev) => prev.map((t, i) => (i === teamIdx ? { ...t, members: t.members.filter((m) => m.key !== key) } : t)))
  }
  function moveMember(fromIdx: number, key: string, toIdx: number) {
    if (fromIdx === toIdx) return
    setTeams((prev) => {
      const member = prev[fromIdx].members.find((m) => m.key === key)
      if (!member) return prev
      return prev.map((t, i) => {
        if (i === fromIdx) return { ...t, members: t.members.filter((m) => m.key !== key) }
        if (i === toIdx) return { ...t, members: [...t.members, member] }
        return t
      })
    })
  }

  async function save() {
    if (published && teams.some((t) => t.members.length === 0)) {
      setError('Every team needs at least one player before you can publish. Fill or remove the empty team.')
      return
    }
    setSaving(true)
    setError(null)
    setNote(null)
    try {
      await adminApi.events.saveTeams(eventId, {
        play_format: format,
        format_config: { team_count: Number(teamCount) || teams.length },
        published,
        teams: teams.map((t, i) => ({
          name: t.name.trim() || `Team ${i + 1}`,
          seed: i + 1,
          pool: null,
          members: t.members.map((m) => ({
            signup_id: m.signup_id,
            display_name: m.signup_id === null ? m.display_name : null,
            is_captain: m.is_captain,
          })),
        })),
      })
      setNote('Saved.')
      load()
      onFormatChange?.()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loadError) return <p className="admin-error">{loadError}</p>
  if (!resp) return <p className="admin-note">Loading&hellip;</p>

  const assignedCount = teams.reduce((n, t) => n + t.members.length, 0)

  return (
    <div className="teams-admin">
      <section>
        <h3>Format</h3>
        <label className="field teams-format-field">
          <select value={format} onChange={(e) => setFormat(e.target.value as PlayFormat)}>
            {FORMAT_ORDER.map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABELS[f]}
              </option>
            ))}
          </select>
        </label>
        {format !== 'none' && (
          <p className="field-hint">
            Team-building works now. The schedule, bracket, and score tracking for this format arrive in a later
            update.
          </p>
        )}
      </section>

      <section>
        <h3>
          Participants <span className="admin-subtab-count">{poolSize}</span>
        </h3>
        <p className="field-hint">
          Only people you include get placed on a team. This is the approved signup list &mdash; uncheck a no-show,
          or add a walk-in by name.
        </p>
        {resp.participants.length === 0 && walkIns.length === 0 ? (
          <p className="admin-note">No approved signups yet. Approve people on the Signups tab, or add walk-ins below.</p>
        ) : (
          <ul className="participant-list">
            {resp.participants.map((p) => (
              <li key={p.signup_id}>
                <label>
                  <input
                    type="checkbox"
                    checked={!excluded.has(p.signup_id)}
                    onChange={() => toggleExcluded(p.signup_id)}
                  />
                  {p.name}
                  <span className="participant-email">{p.email}</span>
                  {p.checked_in && <span className="chip-checked-in">checked in</span>}
                </label>
              </li>
            ))}
            {walkIns.map((name, i) => (
              <li key={`walk-${i}`}>
                <label>
                  <input type="checkbox" checked readOnly />
                  {name} <span className="participant-email">walk-in</span>
                </label>
                <button type="button" className="link-btn" onClick={() => removeWalkIn(i)}>
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="walk-in-row">
          <input
            placeholder="Walk-in name"
            value={newWalkIn}
            onChange={(e) => setNewWalkIn(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addWalkIn()
              }
            }}
          />
          <button type="button" className="btn btn-outline btn-sm" onClick={addWalkIn}>
            Add walk-in
          </button>
        </div>
      </section>

      <section>
        <h3>Teams</h3>
        <div className="teams-generate-row">
          <label className="field">
            Number of teams
            <input
              type="number"
              min="1"
              value={teamCount}
              onChange={(e) => setTeamCount(e.target.value)}
            />
          </label>
          <button type="button" className="btn btn-ace" onClick={generate}>
            {teams.length > 0 ? 'Re-shuffle teams' : 'Generate teams'}
          </button>
          {teams.length > 0 && (
            <span className="field-hint">
              {assignedCount} of {poolSize} placed
            </span>
          )}
        </div>

        {teams.length > 0 && (
          <>
            <div className="team-card-grid">
              {teams.map((team, ti) => (
                <div className="team-card" key={ti}>
                  <input
                    className="team-card-name"
                    value={team.name}
                    onChange={(e) => renameTeam(ti, e.target.value)}
                  />
                  <ul>
                    {team.members.map((m) => (
                      <li key={m.key}>
                        <span className={m.is_captain ? 'team-member-name captain' : 'team-member-name'}>{m.name}</span>
                        <span className="team-member-actions">
                          <button
                            type="button"
                            title={m.is_captain ? 'Unset captain' : 'Make captain'}
                            className={m.is_captain ? 'cap-btn on' : 'cap-btn'}
                            onClick={() => setCaptain(ti, m.key)}
                          >
                            C
                          </button>
                          {teams.length > 1 && (
                            <select
                              value={ti}
                              aria-label="Move to team"
                              onChange={(e) => moveMember(ti, m.key, Number(e.target.value))}
                            >
                              {teams.map((t, i) => (
                                <option key={i} value={i}>
                                  {t.name || `Team ${i + 1}`}
                                </option>
                              ))}
                            </select>
                          )}
                          <button type="button" className="danger" title="Remove" onClick={() => removeMember(ti, m.key)}>
                            &times;
                          </button>
                        </span>
                      </li>
                    ))}
                    {team.members.length === 0 && <li className="team-empty">empty</li>}
                  </ul>
                </div>
              ))}
            </div>

            <label className="switch-row teams-publish-row">
              <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
              Show these teams on the public event page
            </label>
          </>
        )}

        {hasSchedule && (
          <p className="field-hint">Saving these teams clears the current schedule &mdash; you&rsquo;ll regenerate it on the Schedule &amp; scores tab.</p>
        )}
        {error && <p className="admin-error">{error}</p>}
        {note && <p className="admin-note">{note}</p>}

        <div className="form-actions">
          <span className="form-actions-spacer" />
          <button
            type="button"
            className="btn btn-ace"
            disabled={saving || teams.length === 0}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save teams'}
          </button>
        </div>
      </section>
    </div>
  )
}
