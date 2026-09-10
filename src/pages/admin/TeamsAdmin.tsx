import { useEffect, useMemo, useRef, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import { distributeTeams } from '../../lib/teamBuilder'
import { clampPoolCount, poolLabelAt } from '../../lib/pool'
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
// moving members between teams / the bench; it has no server meaning.
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
// Where a dragged member currently lives: the bench, or a team by index.
type Loc = 'bench' | number

let keySeq = 0
const nextKey = () => `m${keySeq++}`

function participantToMember(p: TeamParticipant): DraftMember {
  return { key: nextKey(), signup_id: p.signup_id, display_name: null, name: p.name, is_captain: false }
}
function walkInToMember(name: string): DraftMember {
  return { key: nextKey(), signup_id: null, display_name: name, name, is_captain: false }
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
  const [bench, setBench] = useState<DraftMember[]>([])
  const [teams, setTeams] = useState<DraftTeam[]>([])
  const [excluded, setExcluded] = useState<DraftMember[]>([])
  const [newWalkIn, setNewWalkIn] = useState('')
  const [published, setPublished] = useState(false)
  const [hasSchedule, setHasSchedule] = useState(false)
  const [poolCount, setPoolCount] = useState('2')
  const [advanceCount, setAdvanceCount] = useState('2')
  const [bracketStage, setBracketStage] = useState<'single' | 'double'>('single')
  const [showExcluded, setShowExcluded] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [savedSnapshot, setSavedSnapshot] = useState('')

  const drag = useRef<{ from: Loc; key: string } | null>(null)
  const [dropTarget, setDropTarget] = useState<Loc | null>(null)

  function hydrate(data: TeamsResponse) {
    setResp(data)
    setFormat((data.play_format as PlayFormat) ?? 'none')
    const placedTeams: DraftTeam[] = data.teams.map((t) => ({
      name: t.name,
      members: t.members.map((m) => ({
        key: nextKey(),
        signup_id: m.signup_id,
        display_name: m.display_name,
        name: m.name,
        is_captain: m.is_captain,
      })),
    }))
    const placedSignupIds = new Set(
      placedTeams.flatMap((t) => t.members).map((m) => m.signup_id).filter((v): v is number => v !== null)
    )
    setTeams(placedTeams)
    setBench(data.participants.filter((p) => !placedSignupIds.has(p.signup_id)).map(participantToMember))
    setExcluded([])
    setPublished(data.published)
    setHasSchedule(data.has_schedule)
    const cfgCount =
      data.format_config && typeof data.format_config.team_count === 'number' ? data.format_config.team_count : null
    const fallbackCount = data.teams.length || Math.max(2, Math.ceil(data.participants.length / 4)) || 2
    setTeamCount(String(cfgCount ?? fallbackCount))
    const cfg = data.format_config ?? {}
    setPoolCount(String(typeof cfg.pools === 'number' ? cfg.pools : 2))
    setAdvanceCount(String(typeof cfg.advance_per_pool === 'number' ? cfg.advance_per_pool : 2))
    setBracketStage(cfg.bracket_stage === 'double' ? 'double' : 'single')
  }

  function load() {
    adminApi.events
      .teams(eventId)
      .then((data) => {
        hydrate(data)
      })
      .catch((e: Error) => {
        console.error('Failed to load teams', e)
        setLoadError(e.message)
      })
  }

  useEffect(load, [eventId])

  const totalPlaceable = bench.length + teams.reduce((n, t) => n + t.members.length, 0)
  const assignedCount = teams.reduce((n, t) => n + t.members.length, 0)

  // Serialized editable state — drives the "unsaved changes" indicator.
  const snapshot = useMemo(
    () =>
      JSON.stringify({
        format,
        teamCount,
        poolCount,
        advanceCount,
        bracketStage,
        published,
        teams: teams.map((t) => ({
          name: t.name,
          members: t.members.map((m) => ({ id: m.signup_id, dn: m.display_name, cap: m.is_captain })),
        })),
      }),
    [format, teamCount, poolCount, advanceCount, bracketStage, published, teams]
  )
  const dirty = savedSnapshot !== '' && snapshot !== savedSnapshot
  useEffect(() => {
    if (resp && savedSnapshot === '') setSavedSnapshot(snapshot)
  }, [resp, snapshot, savedSnapshot])

  function locMembers(loc: Loc): DraftMember[] {
    return loc === 'bench' ? bench : teams[loc]?.members ?? []
  }
  function setLocMembers(loc: Loc, next: DraftMember[]) {
    if (loc === 'bench') setBench(next)
    else setTeams((prev) => prev.map((t, i) => (i === loc ? { ...t, members: next } : t)))
  }

  function moveMember(from: Loc, key: string, to: Loc) {
    if (from === to) return
    const member = locMembers(from).find((m) => m.key === key)
    if (!member) return
    setLocMembers(
      from,
      locMembers(from).filter((m) => m.key !== key)
    )
    const landing = to === 'bench' ? { ...member, is_captain: false } : member
    setLocMembers(to, [...locMembers(to), landing])
  }

  function onDrop(to: Loc) {
    setDropTarget(null)
    const d = drag.current
    drag.current = null
    if (d) moveMember(d.from, d.key, to)
  }

  function excludeMember(from: Loc, key: string) {
    const member = locMembers(from).find((m) => m.key === key)
    if (!member) return
    setLocMembers(
      from,
      locMembers(from).filter((m) => m.key !== key)
    )
    setExcluded((prev) => [...prev, { ...member, is_captain: false }])
  }
  function readdExcluded(key: string) {
    const member = excluded.find((m) => m.key === key)
    if (!member) return
    setExcluded((prev) => prev.filter((m) => m.key !== key))
    setBench((prev) => [...prev, member])
  }

  function addWalkIn() {
    const name = newWalkIn.trim()
    if (!name) return
    const known = [...bench, ...teams.flatMap((t) => t.members), ...excluded].some(
      (m) => m.name.toLowerCase() === name.toLowerCase()
    )
    if (known) {
      setError(`"${name}" is already on the list.`)
      return
    }
    setBench((prev) => [...prev, walkInToMember(name)])
    setNewWalkIn('')
    setError(null)
  }

  function generate() {
    const pool = [...bench, ...teams.flatMap((t) => t.members)]
    if (pool.length === 0) {
      setError('Add at least one player before generating teams.')
      return
    }
    if (assignedCount > 0 && !confirm('Reshuffle everyone into fresh teams?')) return
    const count = Math.max(1, Math.min(Number(teamCount) || 1, pool.length))
    const buckets = distributeTeams(
      pool.map((m) => ({ ...m, is_captain: false })),
      count
    )
    setTeams(buckets.map((members, i) => ({ name: teams[i]?.name || `Team ${i + 1}`, members })))
    setBench([])
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

  async function save() {
    if (published && teams.some((t) => t.members.length === 0)) {
      setError('Every team needs at least one player before you can publish. Fill or remove the empty team.')
      return
    }
    setSaving(true)
    setError(null)
    setNote(null)
    try {
      const pools = clampPoolCount(Number(poolCount) || 2, teams.length)
      await adminApi.events.saveTeams(eventId, {
        play_format: format,
        format_config: {
          team_count: Number(teamCount) || teams.length,
          pools,
          advance_per_pool: Math.max(1, Number(advanceCount) || 2),
          bracket_stage: format === 'double_elim' ? 'double' : bracketStage,
        },
        published,
        teams: teams.map((t, i) => ({
          name: t.name.trim() || `Team ${i + 1}`,
          seed: i + 1,
          pool: format === 'pool_bracket' ? poolLabelAt(i, pools) : null,
          members: t.members.map((m) => ({
            signup_id: m.signup_id,
            display_name: m.signup_id === null ? m.display_name : null,
            is_captain: m.is_captain,
          })),
        })),
      })
      setNote('Saved.')
      setSavedSnapshot(snapshot)
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

  const avgSize = teams.length > 0 ? assignedCount / teams.length : 0
  // Drag handle + keyboard fallback for one member. With the handle focused,
  // 1-9 moves to that team and 0 sends to the bench — the a11y path now that
  // the per-row "move to" select is gone.
  const moveHandleProps = (from: Loc, key: string) => ({
    draggable: true,
    tabIndex: 0,
    role: 'button' as const,
    onDragStart: (e: React.DragEvent) => {
      drag.current = { from, key }
      // Firefox won't start a drag unless dataTransfer carries something.
      e.dataTransfer.setData('text/plain', key)
      e.dataTransfer.effectAllowed = 'move'
    },
    onDragEnd: () => {
      drag.current = null
      setDropTarget(null)
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === '0') {
        e.preventDefault()
        moveMember(from, key, 'bench')
      } else if (/^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1
        if (idx < teams.length) {
          e.preventDefault()
          moveMember(from, key, idx)
        }
      }
    },
  })
  const dropZone = (to: Loc) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      setDropTarget(to)
    },
    onDragLeave: () => setDropTarget((cur) => (cur === to ? null : cur)),
    onDrop: () => onDrop(to),
  })
  const sameLoc = (a: Loc | null, b: Loc) => a === b

  return (
    <div className="teams-admin">
      <section>
        <div className="teams-head">
          <label className="field teams-format-field" style={{ margin: 0 }}>
            <select value={format} onChange={(e) => setFormat(e.target.value as PlayFormat)}>
              {FORMAT_ORDER.map((f) => (
                <option key={f} value={f}>
                  {FORMAT_LABELS[f]}
                </option>
              ))}
            </select>
          </label>
          {teams.length > 0 && (
            <div className="teams-publish-toggle" role="group" aria-label="Publish teams">
              <button
                type="button"
                className={!published ? 'on draft-on' : ''}
                aria-pressed={!published}
                onClick={() => setPublished(false)}
              >
                Draft
              </button>
              <button
                type="button"
                className={published ? 'on' : ''}
                aria-pressed={published}
                onClick={() => setPublished(true)}
              >
                Published
              </button>
            </div>
          )}
          {teams.length > 0 && (
            <span className="field-hint">
              {published ? 'Teams show on the public event page.' : 'Teams are hidden from the public page.'}
            </span>
          )}
        </div>
        {format === 'double_elim' && (
          <p className="field-hint">
            Every team gets a second chance in the losers bracket; a team is out after two losses. The bracket
            ends with a grand final (plus a reset game if the losers-bracket team wins it).
          </p>
        )}
        {format === 'pool_bracket' && (
          <>
            <p className="field-hint">Pools play a round robin, then the top finishers seed into a knockout bracket.</p>
            <dl className="kv" style={{ marginTop: '0.6rem', maxWidth: '20rem' }}>
              <dt>Pools</dt>
              <dd>
                <input
                  type="number"
                  min="1"
                  value={poolCount}
                  onChange={(e) => setPoolCount(e.target.value)}
                  style={{ width: '4rem' }}
                />
              </dd>
              <dt>Advance</dt>
              <dd>
                top{' '}
                <input
                  type="number"
                  min="1"
                  value={advanceCount}
                  onChange={(e) => setAdvanceCount(e.target.value)}
                  style={{ width: '4rem' }}
                />{' '}
                per pool
              </dd>
              <dt>Bracket</dt>
              <dd>
                <select value={bracketStage} onChange={(e) => setBracketStage(e.target.value as 'single' | 'double')}>
                  <option value="single">Single elimination</option>
                  <option value="double">Double elimination</option>
                </select>
              </dd>
            </dl>
          </>
        )}
      </section>

      <section>
        <h3>
          Roster <span className="admin-subtab-count">{totalPlaceable}</span>
        </h3>
        <p className="field-hint">
          Everyone approved starts on the bench. Drag people between the bench and teams &mdash; or focus a name and
          press a team number (1&ndash;9), or 0 for the bench. Mark a no-show with &times; to keep them out of the
          shuffle; add a walk-in below.
        </p>

        <div className="teams-generate-row">
          <label className="field">
            Number of teams
            <input type="number" min="1" value={teamCount} onChange={(e) => setTeamCount(e.target.value)} />
          </label>
          <button type="button" className="btn btn-ace" onClick={generate}>
            {assignedCount > 0 ? 'Reshuffle teams' : 'Generate teams'}
          </button>
          {teams.length > 0 && (
            <span className="field-hint">
              {assignedCount} of {totalPlaceable} placed
            </span>
          )}
        </div>

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

        {excluded.length > 0 && (
          <p className="field-hint" style={{ marginTop: '0.6rem' }}>
            {excluded.length} marked not attending &mdash;{' '}
            <button type="button" className="link-btn" onClick={() => setShowExcluded((v) => !v)}>
              {showExcluded ? 'hide' : 'show'}
            </button>
            {showExcluded && (
              <span>
                {': '}
                {excluded.map((m, i) => (
                  <span key={m.key}>
                    {i > 0 && ', '}
                    {m.name}{' '}
                    <button type="button" className="link-btn" onClick={() => readdExcluded(m.key)}>
                      add back
                    </button>
                  </span>
                ))}
              </span>
            )}
          </p>
        )}

        <div className="teams-dnd" style={{ marginTop: '0.9rem' }}>
          <div
            className={`team-bench${sameLoc(dropTarget, 'bench') ? ' drop-target' : ''}`}
            {...dropZone('bench')}
          >
            <h4>
              Bench <em>{bench.length}</em>
            </h4>
            {bench.length === 0 ? (
              <p className="team-bench-empty">Everyone&rsquo;s placed.</p>
            ) : (
              bench.map((m) => (
                <div
                  key={m.key}
                  className="player-chip"
                  title="Drag onto a team (or focus and press 1-9)"
                  aria-label={`${m.name} — drag onto a team, or press a team number 1-9`}
                  {...moveHandleProps('bench', m.key)}
                >
                  {m.name}
                  {m.signup_id === null && <span className="walk-in-tag">walk-in</span>}
                  <button
                    type="button"
                    className="link-btn"
                    title="Mark not attending"
                    onClick={() => excludeMember('bench', m.key)}
                  >
                    &times;
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="team-card-grid">
            {teams.length === 0 && (
              <p className="admin-note">Set a team count and hit &ldquo;Generate teams&rdquo;.</p>
            )}
            {teams.map((team, ti) => (
              <div
                key={ti}
                className={`team-card${sameLoc(dropTarget, ti) ? ' drop-target' : ''}`}
                {...dropZone(ti)}
              >
                <div className="team-card-head">
                  <span
                    className={`team-balance-dot ${Math.abs(team.members.length - avgSize) >= 1.5 ? 'off' : 'ok'}`}
                    title="Team balance"
                  />
                  <input
                    className="team-card-name"
                    value={team.name}
                    onChange={(e) => renameTeam(ti, e.target.value)}
                  />
                  <span className="team-count-badge">{team.members.length}</span>
                </div>
                {format === 'pool_bracket' && (
                  <span className="team-pool-tag">
                    Pool {poolLabelAt(ti, clampPoolCount(Number(poolCount) || 2, teams.length))}
                  </span>
                )}
                <ul>
                  {team.members.map((m) => (
                    <li key={m.key} className="team-member-row">
                      <span
                        className={m.is_captain ? 'team-member-name captain' : 'team-member-name'}
                        title="Drag to another team or the bench (or focus and press 1-9 / 0)"
                        aria-label={`${m.name} — drag to move, or press a team number 1-9, or 0 for the bench`}
                        {...moveHandleProps(ti, m.key)}
                      >
                        {m.name}
                      </span>
                      <span className="team-member-actions">
                        <button
                          type="button"
                          title={m.is_captain ? 'Unset captain' : 'Make captain'}
                          className={m.is_captain ? 'cap-btn on' : 'cap-btn'}
                          onClick={() => setCaptain(ti, m.key)}
                        >
                          C
                        </button>
                        <button
                          type="button"
                          className="danger"
                          title="Move to bench"
                          onClick={() => moveMember(ti, m.key, 'bench')}
                        >
                          &times;
                        </button>
                      </span>
                    </li>
                  ))}
                  {team.members.length === 0 && <li className="team-empty">drop players here</li>}
                </ul>
                {sameLoc(dropTarget, ti) && <div className="team-card-drop-hint">Drop to add</div>}
              </div>
            ))}
          </div>
        </div>

        {hasSchedule && (
          <p className="field-hint">
            Saving these teams clears the current schedule &mdash; you&rsquo;ll regenerate it on the Schedule &amp;
            scores tab.
          </p>
        )}
        {error && <p className="admin-error">{error}</p>}

        <div className="teams-save-bar">
          {dirty ? (
            <span className="unsaved">&#9679; Unsaved changes</span>
          ) : (
            <span className="saved">{note ?? 'All changes saved.'}</span>
          )}
          <span className="teams-save-bar-spacer" />
          <button type="button" className="btn btn-outline btn-sm" disabled={saving || !dirty} onClick={load}>
            Discard
          </button>
          <button type="button" className="btn btn-ace btn-sm" disabled={saving || teams.length === 0} onClick={save}>
            {saving ? 'Saving…' : 'Save teams'}
          </button>
        </div>
      </section>
    </div>
  )
}
