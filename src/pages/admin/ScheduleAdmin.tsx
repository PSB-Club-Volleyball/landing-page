import { useEffect, useRef, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import { buildRoundRobinSchedule } from '../../lib/schedule'
import { buildSingleElimBracket, buildDoubleElimBracket } from '../../lib/bracket'
import { buildPoolSchedule, seedFromPools } from '../../lib/pool'
import { BracketColumns } from '../../components/BracketColumns'
import type { EventMatch, MatchesResponse, PlayFormat, ScheduleConfig, StandingRow } from '../../types'

const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
function slotTime(iso: string | null) {
  return iso ? timeFmt.format(new Date(iso)) : ''
}

// Per-match editable result: one [a, b] string pair per set, plus an optional
// forfeit. `edited` marks a draft the admin has typed into since it was last
// loaded, so a reload after saving some *other* match keeps it.
interface ResultDraft {
  sets: [string, string][]
  forfeit: number | null
  edited: boolean
}

function toDraft(m: EventMatch, setsPerMatch: number): ResultDraft {
  const sets: [string, string][] = (m.scores ?? []).map(([a, b]) => [String(a), String(b)])
  while (sets.length < setsPerMatch) sets.push(['', ''])
  return { sets, forfeit: m.forfeit_team_id, edited: false }
}

// Blank sets are skipped; a set with only one side filled in (or anything but
// a whole number) is rejected rather than recorded as 0.
function draftToScores(d: ResultDraft): [number, number][] {
  const scores: [number, number][] = []
  d.sets.forEach(([a, b], i) => {
    const sa = a.trim()
    const sb = b.trim()
    if (sa === '' && sb === '') return
    if (!/^\d+$/.test(sa) || !/^\d+$/.test(sb)) {
      throw new Error(`Set ${i + 1}: enter a whole-number score for both teams, or leave both blank.`)
    }
    scores.push([Number(sa), Number(sb)])
  })
  return scores
}

function StandingsTable({ rows }: { rows: StandingRow[] }) {
  return (
    <div className="data-table">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th>W</th>
            <th>L</th>
            <th>Sets</th>
            <th>Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.team_id}>
              <td>{i + 1}</td>
              <td>{r.name}</td>
              <td>{r.wins}</td>
              <td>{r.losses}</td>
              <td>
                {r.sets_won}&ndash;{r.sets_lost}
              </td>
              <td>
                {r.points_for - r.points_against > 0 ? '+' : ''}
                {r.points_for - r.points_against}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ScoreEntry({
  match,
  draft,
  busy,
  onChange,
  onSave,
}: {
  match: EventMatch
  draft: ResultDraft
  busy: boolean
  onChange: (next: ResultDraft) => void
  onSave: () => void
}) {
  return (
    <span className="match-score-entry">
      {draft.forfeit == null &&
        draft.sets.map((s, i) => (
          <span className="set-input" key={i}>
            <input
              type="number"
              min="0"
              aria-label={`Set ${i + 1} ${match.team_a_name}`}
              value={s[0]}
              onChange={(e) =>
                onChange({
                  ...draft,
                  sets: draft.sets.map((x, j) => (j === i ? ([e.target.value, x[1]] as [string, string]) : x)),
                })
              }
            />
            <span>&ndash;</span>
            <input
              type="number"
              min="0"
              aria-label={`Set ${i + 1} ${match.team_b_name}`}
              value={s[1]}
              onChange={(e) =>
                onChange({
                  ...draft,
                  sets: draft.sets.map((x, j) => (j === i ? ([x[0], e.target.value] as [string, string]) : x)),
                })
              }
            />
          </span>
        ))}
      <select
        aria-label="Forfeit"
        value={draft.forfeit ?? ''}
        onChange={(e) => onChange({ ...draft, forfeit: e.target.value ? Number(e.target.value) : null })}
      >
        <option value="">No forfeit</option>
        {match.team_a_id != null && <option value={match.team_a_id}>{match.team_a_name} forfeits</option>}
        {match.team_b_id != null && <option value={match.team_b_id}>{match.team_b_name} forfeits</option>}
      </select>
      <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={onSave}>
        Save
      </button>
    </span>
  )
}

export default function ScheduleAdmin({
  eventId,
  playFormat,
  onDirtyChange,
}: {
  eventId: number
  playFormat: PlayFormat
  // Reports typed-but-unsaved scores so the parent can confirm before a tab
  // switch unmounts this editor.
  onDirtyChange?: (dirty: boolean) => void
}) {
  const mode: 'rr' | 'bracket' | 'double' | 'pool' | 'unsupported' =
    playFormat === 'round_robin'
      ? 'rr'
      : playFormat === 'single_elim'
        ? 'bracket'
        : playFormat === 'double_elim'
          ? 'double'
          : playFormat === 'pool_bracket'
            ? 'pool'
            : 'unsupported'

  const [data, setData] = useState<MatchesResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [config, setConfig] = useState<ScheduleConfig | null>(null)
  // The numeric inputs are backed by their own text so the field can be blank
  // while you retype it; `config` only holds the last valid value, snapping
  // back on blur.
  const [courtsText, setCourtsText] = useState('')
  const [totalText, setTotalText] = useState('')
  const [drafts, setDrafts] = useState<Record<number, ResultDraft>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  // `keepEdited`: preserve drafts the admin has typed into (a reload after
  // saving one match or the settings must not wipe scores typed into the
  // others). Off when the match set itself was rebuilt.
  function hydrate(res: MatchesResponse, keepEdited: boolean) {
    setData(res)
    setConfig(res.config)
    setCourtsText(String(res.config.courts))
    setTotalText(String(res.config.total_minutes))
    setDrafts((prev) => {
      const d: Record<number, ResultDraft> = {}
      for (const m of res.matches) {
        const kept = prev[m.id]
        d[m.id] = keepEdited && kept?.edited ? kept : toDraft(m, res.config.sets_per_match)
      }
      return d
    })
  }

  function load() {
    adminApi.events
      .matches(eventId)
      .then((res) => hydrate(res, true))
      .catch((e: Error) => {
        console.error('Failed to load schedule', e)
        setLoadError(e.message)
      })
  }

  useEffect(load, [eventId])

  const dirty = Object.values(drafts).some((d) => d.edited)
  useEffect(() => {
    onDirtyChange?.(dirty)
    return () => onDirtyChange?.(false)
  }, [dirty, onDirtyChange])

  // Reflow each match's set-input rows when "sets per match" changes, keeping
  // whatever's already typed.
  const lastSetsPerMatch = useRef<number | null>(null)
  useEffect(() => {
    if (!config) return
    if (lastSetsPerMatch.current === null) {
      lastSetsPerMatch.current = config.sets_per_match
      return
    }
    if (lastSetsPerMatch.current === config.sets_per_match) return
    lastSetsPerMatch.current = config.sets_per_match
    setDrafts((prev) => {
      const next: Record<number, ResultDraft> = {}
      for (const [id, d] of Object.entries(prev)) {
        const sets = d.sets.slice(0, Math.max(config.sets_per_match, d.sets.filter(([a, b]) => a || b).length))
        while (sets.length < config.sets_per_match) sets.push(['', ''])
        next[Number(id)] = { ...d, sets }
      }
      return next
    })
  }, [config])

  if (mode === 'unsupported') {
    return <p className="admin-note">This format doesn&rsquo;t have a schedule.</p>
  }
  if (loadError) return <p className="admin-error">{loadError}</p>
  if (!data || !config) return <p className="admin-note">Loading&hellip;</p>

  const teamIds = data.teams.map((t) => t.id)
  const hasResults = data.standings.some((s) => s.played > 0)
  const noun = mode === 'bracket' || mode === 'double' ? 'bracket' : mode === 'pool' ? 'pools' : 'schedule'
  const isBracketMode = mode === 'bracket' || mode === 'double'

  const poolLabels = [...new Set(data.teams.map((t) => t.pool).filter((p): p is string => p != null))].sort()
  const poolGroups = poolLabels.map((label) => data.teams.filter((t) => t.pool === label).map((t) => t.id))
  const bracketMatches = data.matches.filter((m) => m.bracket === 'winners' || m.bracket === 'losers' || m.bracket === 'final')
  const bracketStarted = bracketMatches.length > 0
  const poolsComplete = data.pools.length > 0 && data.pools.every((p) => p.complete)

  async function saveSettings() {
    if (!config) return
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      hydrate(await adminApi.events.saveScheduleConfig(eventId, config), true)
      setNote('Settings saved.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function generate() {
    if (!config) return
    if (teamIds.length < 2) {
      setError('Build at least two teams on the Teams & format tab first.')
      return
    }
    if (mode === 'pool' && poolGroups.length < 1) {
      setError('Assign teams to a pool on the Teams & format tab first.')
      return
    }
    if (data && data.matches.length > 0 && !confirm(`Replace the current ${noun}? Any entered scores are cleared.`)) return
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const matches =
        mode === 'double'
          ? buildDoubleElimBracket(teamIds)
          : mode === 'bracket'
            ? buildSingleElimBracket(teamIds)
            : mode === 'pool'
              ? buildPoolSchedule(poolGroups, config.courts)
              : buildRoundRobinSchedule(teamIds, config.courts, config.double_round_robin)
      hydrate(await adminApi.events.saveSchedule(eventId, { config, matches }), false)
      setNote(`${noun[0].toUpperCase()}${noun.slice(1)} generated.`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function startBracket() {
    if (!config || !data) return
    if (!poolsComplete) {
      setError('Enter every pool result before starting the bracket.')
      return
    }
    // Pool scores lock once the bracket exists, so an unsaved edit would be
    // stranded (hidden, but still counted as unsaved).
    if (dirty) {
      setError('Save or undo your edited scores before starting the bracket.')
      return
    }
    if (!confirm('Start the knockout bracket from the pool standings?')) return
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const seeds = seedFromPools(data.pools, config.advance_per_pool)
      const built = config.bracket_stage === 'double' ? buildDoubleElimBracket(seeds) : buildSingleElimBracket(seeds)
      hydrate(await adminApi.events.startBracket(eventId, built), true)
      setNote('Bracket started.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function saveResult(match: EventMatch) {
    const d = drafts[match.id]
    if (!d) return
    setBusy(true)
    setError(null)
    try {
      await adminApi.events.saveMatchResult(eventId, match.id, {
        scores: d.forfeit != null ? null : draftToScores(d),
        forfeit_team_id: d.forfeit,
      })
      // Saved: this draft now matches the server, so let the reload replace it.
      setDrafts((prev) => ({ ...prev, [match.id]: { ...prev[match.id], edited: false } }))
      load()
      setNote(`Saved result for ${match.team_a_name} v ${match.team_b_name}.`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function setDraft(id: number, next: ResultDraft) {
    setDrafts((prev) => ({ ...prev, [id]: { ...next, edited: true } }))
  }

  const pending = (text: string) => {
    const n = Number(text)
    return !Number.isFinite(n) || n < 1 || text.trim() === ''
  }

  const rounds = [...new Set(data.matches.map((m) => m.round))].sort((a, b) => a - b)
  const rrRoundLabel = (round: number) => {
    const first = data.matches.find((m) => m.round === round)
    return slotTime(first?.start_time ?? null) || `Round ${round}`
  }

  return (
    <div className="schedule-admin">
      <section>
        <h3>{isBracketMode ? 'Bracket settings' : mode === 'pool' ? 'Pool settings' : 'Schedule settings'}</h3>
        <div className="schedule-config">
          {!isBracketMode && (
            <label className="field">
              Courts
              <input
                type="number"
                min="1"
                value={courtsText}
                onChange={(e) => {
                  setCourtsText(e.target.value)
                  const n = Number(e.target.value)
                  if (Number.isFinite(n) && n >= 1) setConfig({ ...config, courts: Math.floor(n) })
                }}
                onBlur={() => setCourtsText(String(config.courts))}
              />
              {pending(courtsText) && (
                <span className="field-hint field-hint-warn">must be 1 or more &mdash; keeping {config.courts}</span>
              )}
            </label>
          )}
          <label className="field">
            Sets per match
            <select
              value={config.sets_per_match}
              onChange={(e) => setConfig({ ...config, sets_per_match: Number(e.target.value) as 1 | 3 | 5 })}
            >
              <option value={1}>Best of 1</option>
              <option value={3}>Best of 3</option>
              <option value={5}>Best of 5</option>
            </select>
          </label>
          <label className="field">
            Total time <span className="field-hint">(minutes)</span>
            <input
              type="number"
              min="1"
              value={totalText}
              onChange={(e) => {
                setTotalText(e.target.value)
                const n = Number(e.target.value)
                if (Number.isFinite(n) && n >= 1) setConfig({ ...config, total_minutes: Math.floor(n) })
              }}
              onBlur={() => setTotalText(String(config.total_minutes))}
            />
            {pending(totalText) && (
              <span className="field-hint field-hint-warn">must be 1 or more &mdash; keeping {config.total_minutes}</span>
            )}
          </label>
          {mode === 'rr' && (
            <>
              <label className="switch-row">
                <input
                  type="checkbox"
                  checked={config.double_round_robin}
                  onChange={(e) => setConfig({ ...config, double_round_robin: e.target.checked })}
                />
                Double round robin (every pairing twice)
              </label>
              <label className="switch-row">
                <input
                  type="checkbox"
                  checked={config.timed_only}
                  onChange={(e) => setConfig({ ...config, timed_only: e.target.checked })}
                />
                Time only &mdash; publish the rotation, don&rsquo;t track scores
              </label>
            </>
          )}
        </div>
        <p className="schedule-actions">
          {data.matches.length > 0 && (
            <button type="button" className="btn btn-outline" disabled={busy} onClick={saveSettings}>
              Save settings
            </button>
          )}
          <button type="button" className="btn btn-ace" disabled={busy} onClick={generate}>
            {data.matches.length > 0 ? `Regenerate ${noun}` : `Generate ${noun}`}
          </button>
        </p>
        {data.matches.length > 0 && (
          <p className="field-hint">
            &ldquo;Save settings&rdquo; keeps the matches and scores; &ldquo;Regenerate&rdquo; rebuilds the whole {noun}{' '}
            and clears results.
          </p>
        )}
        {error && <p className="admin-error">{error}</p>}
        {note && <p className="admin-note">{note}</p>}
      </section>

      {mode === 'pool' && data.pools.length > 0 && (
        <section>
          <div className="admin-main-head">
            <h3>Pools</h3>
            {!bracketStarted && (
              <button
                type="button"
                className="btn btn-ace btn-sm"
                disabled={busy || !poolsComplete}
                onClick={startBracket}
              >
                Start bracket
              </button>
            )}
          </div>
          {!poolsComplete && !bracketStarted && (
            <p className="field-hint">Enter every pool result to unlock the bracket.</p>
          )}
          {data.pools.map((pool) => (
            <div className="pool-block" key={pool.label}>
              <h4>Pool {pool.label}</h4>
              <div className="match-list">
                {data.matches
                  .filter((m) => m.pool === pool.label)
                  .map((m) => {
                    const d = drafts[m.id]
                    return (
                      <div className="match-row" key={m.id}>
                        <span className="match-when">
                          {slotTime(m.start_time)}
                          {m.court && <span className="match-court">Court {m.court}</span>}
                        </span>
                        <span className="match-teams">
                          <span className={m.winner_id === m.team_a_id ? 'match-team win' : 'match-team'}>
                            {m.team_a_name}
                          </span>
                          <span className="match-v">v</span>
                          <span className={m.winner_id === m.team_b_id ? 'match-team win' : 'match-team'}>
                            {m.team_b_name}
                          </span>
                        </span>
                        {/* The server refuses pool changes once the bracket
                            exists (it would leave the wrong teams seeded). */}
                        {d && !bracketStarted && (
                          <ScoreEntry
                            match={m}
                            draft={d}
                            busy={busy}
                            onChange={(next) => setDraft(m.id, next)}
                            onSave={() => saveResult(m)}
                          />
                        )}
                      </div>
                    )
                  })}
              </div>
              {pool.standings.some((s) => s.played > 0) && <StandingsTable rows={pool.standings} />}
            </div>
          ))}
        </section>
      )}

      {(isBracketMode || (mode === 'pool' && bracketStarted)) && bracketMatches.length > 0 && (
        <section>
          <h3>Bracket</h3>
          <div className="bracket-admin">
            <BracketColumns
              matches={bracketMatches}
              renderExtra={(m) => {
                const d = drafts[m.id]
                const playable = m.team_a_id != null && m.team_b_id != null
                return playable && d ? (
                  <ScoreEntry
                    match={m}
                    draft={d}
                    busy={busy}
                    onChange={(next) => setDraft(m.id, next)}
                    onSave={() => saveResult(m)}
                  />
                ) : null
              }}
            />
          </div>
        </section>
      )}

      {mode === 'rr' && data.matches.length > 0 && (
        <section>
          <h3>Matches</h3>
          {rounds.map((round) => (
            <div className="match-round" key={round}>
              <h4>{rrRoundLabel(round)}</h4>
              <div className="match-list">
                {data.matches
                  .filter((m) => m.round === round)
                  .map((m) => {
                    const d = drafts[m.id]
                    return (
                      <div className="match-row" key={m.id}>
                        <span className="match-when">
                          {slotTime(m.start_time)}
                          {m.court && <span className="match-court">Court {m.court}</span>}
                        </span>
                        <span className="match-teams">
                          <span className={m.winner_id === m.team_a_id ? 'match-team win' : 'match-team'}>
                            {m.team_a_name}
                          </span>
                          <span className="match-v">v</span>
                          <span className={m.winner_id === m.team_b_id ? 'match-team win' : 'match-team'}>
                            {m.team_b_name}
                          </span>
                        </span>
                        {!config.timed_only && d && (
                          <ScoreEntry
                            match={m}
                            draft={d}
                            busy={busy}
                            onChange={(next) => setDraft(m.id, next)}
                            onSave={() => saveResult(m)}
                          />
                        )}
                      </div>
                    )
                  })}
              </div>
            </div>
          ))}
        </section>
      )}

      {mode === 'rr' && !config.timed_only && hasResults && (
        <section>
          <h3>Standings</h3>
          <StandingsTable rows={data.standings} />
        </section>
      )}
    </div>
  )
}
