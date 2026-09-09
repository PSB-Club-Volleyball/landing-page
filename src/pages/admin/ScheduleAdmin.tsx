import { useEffect, useRef, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import { buildRoundRobinSchedule } from '../../lib/schedule'
import type { EventMatch, MatchesResponse, PlayFormat, ScheduleConfig } from '../../types'

const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
function slotTime(iso: string | null) {
  return iso ? timeFmt.format(new Date(iso)) : ''
}

// Per-match editable result: one [a, b] string pair per set, plus an optional
// forfeit.
interface ResultDraft {
  sets: [string, string][]
  forfeit: number | null
}

function toDraft(m: EventMatch, setsPerMatch: number): ResultDraft {
  const sets: [string, string][] = (m.scores ?? []).map(([a, b]) => [String(a), String(b)])
  while (sets.length < setsPerMatch) sets.push(['', ''])
  return { sets: sets.slice(0, Math.max(setsPerMatch, sets.length)), forfeit: m.forfeit_team_id }
}

function draftToScores(d: ResultDraft): [number, number][] {
  return d.sets
    .filter(([a, b]) => a.trim() !== '' || b.trim() !== '')
    .map(([a, b]) => [Number(a) || 0, Number(b) || 0] as [number, number])
}

export default function ScheduleAdmin({ eventId, playFormat }: { eventId: number; playFormat: PlayFormat }) {
  const [data, setData] = useState<MatchesResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [config, setConfig] = useState<ScheduleConfig | null>(null)
  // The numeric inputs are backed by their own text so the field can be blank
  // while you retype it; `config` only ever holds the last valid value, and a
  // blank field snaps back on blur.
  const [courtsText, setCourtsText] = useState('')
  const [totalText, setTotalText] = useState('')
  const [drafts, setDrafts] = useState<Record<number, ResultDraft>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  function hydrate(res: MatchesResponse) {
    setData(res)
    setConfig(res.config)
    setCourtsText(String(res.config.courts))
    setTotalText(String(res.config.total_minutes))
    const d: Record<number, ResultDraft> = {}
    for (const m of res.matches) d[m.id] = toDraft(m, res.config.sets_per_match)
    setDrafts(d)
  }

  function load() {
    adminApi.events
      .matches(eventId)
      .then(hydrate)
      .catch((e: Error) => {
        console.error('Failed to load schedule', e)
        setLoadError(e.message)
      })
  }

  useEffect(load, [eventId])

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

  if (loadError) return <p className="admin-error">{loadError}</p>
  if (!data || !config) return <p className="admin-note">Loading&hellip;</p>

  const teamIds = data.teams.map((t) => t.id)
  const hasResults = data.standings.some((s) => s.played > 0)

  async function saveSettings() {
    if (!config) return
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const res = await adminApi.events.saveScheduleConfig(eventId, config)
      hydrate(res)
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
    if (data && data.matches.length > 0 && !confirm('Replace the current schedule? Any entered scores are cleared.')) return
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const matches = buildRoundRobinSchedule(teamIds, config.courts, playFormat === 'round_robin' && config.double_round_robin)
      const res = await adminApi.events.saveSchedule(eventId, { config, matches })
      hydrate(res)
      setNote('Schedule generated.')
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
      load()
      setNote(`Saved result for ${match.team_a_name} v ${match.team_b_name}.`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function setDraft(id: number, next: ResultDraft) {
    setDrafts((prev) => ({ ...prev, [id]: next }))
  }

  const rounds = [...new Set(data.matches.map((m) => m.round))].sort((a, b) => a - b)
  const roundLabel = (round: number) => {
    const first = data.matches.find((m) => m.round === round)
    return slotTime(first?.start_time ?? null) || `Round ${round}`
  }

  // A number field is "pending" when its text doesn't parse to a whole number
  // >= 1 — allowed while typing, but flagged so it's clear it won't be saved.
  const pending = (text: string) => {
    const n = Number(text)
    return !Number.isFinite(n) || n < 1 || text.trim() === ''
  }

  return (
    <div className="schedule-admin">
      <section>
        <h3>Schedule settings</h3>
        <div className="schedule-config">
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
            {pending(courtsText) && <span className="field-hint field-hint-warn">must be 1 or more &mdash; keeping {config.courts}</span>}
          </label>
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
            {pending(totalText) && <span className="field-hint field-hint-warn">must be 1 or more &mdash; keeping {config.total_minutes}</span>}
          </label>
          {playFormat === 'round_robin' && (
            <label className="switch-row">
              <input
                type="checkbox"
                checked={config.double_round_robin}
                onChange={(e) => setConfig({ ...config, double_round_robin: e.target.checked })}
              />
              Double round robin (every pairing twice)
            </label>
          )}
          <label className="switch-row">
            <input
              type="checkbox"
              checked={config.timed_only}
              onChange={(e) => setConfig({ ...config, timed_only: e.target.checked })}
            />
            Time only &mdash; publish the rotation, don&rsquo;t track scores
          </label>
        </div>
        <p className="schedule-actions">
          {data.matches.length > 0 && (
            <button type="button" className="btn btn-outline" disabled={busy} onClick={saveSettings}>
              Save settings
            </button>
          )}
          <button type="button" className="btn btn-ace" disabled={busy} onClick={generate}>
            {data.matches.length > 0 ? 'Regenerate schedule' : 'Generate schedule'}
          </button>
        </p>
        {data.matches.length > 0 && (
          <p className="field-hint">
            &ldquo;Save settings&rdquo; keeps the matches and scores; &ldquo;Regenerate&rdquo; rebuilds the whole
            schedule and clears results.
          </p>
        )}
        {error && <p className="admin-error">{error}</p>}
        {note && <p className="admin-note">{note}</p>}
      </section>

      {data.matches.length > 0 && (
        <section>
          <h3>Matches</h3>
          {rounds.map((round) => (
            <div className="match-round" key={round}>
              <h4>{roundLabel(round)}</h4>
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
                          <span className="match-score-entry">
                            {d.forfeit == null &&
                              d.sets.map((s, i) => (
                                <span className="set-input" key={i}>
                                  <input
                                    type="number"
                                    min="0"
                                    aria-label={`Set ${i + 1} ${m.team_a_name}`}
                                    value={s[0]}
                                    onChange={(e) => {
                                      const sets = d.sets.map((x, j) => (j === i ? ([e.target.value, x[1]] as [string, string]) : x))
                                      setDraft(m.id, { ...d, sets })
                                    }}
                                  />
                                  <span>&ndash;</span>
                                  <input
                                    type="number"
                                    min="0"
                                    aria-label={`Set ${i + 1} ${m.team_b_name}`}
                                    value={s[1]}
                                    onChange={(e) => {
                                      const sets = d.sets.map((x, j) => (j === i ? ([x[0], e.target.value] as [string, string]) : x))
                                      setDraft(m.id, { ...d, sets })
                                    }}
                                  />
                                </span>
                              ))}
                            <select
                              aria-label="Forfeit"
                              value={d.forfeit ?? ''}
                              onChange={(e) =>
                                setDraft(m.id, { ...d, forfeit: e.target.value ? Number(e.target.value) : null })
                              }
                            >
                              <option value="">No forfeit</option>
                              {m.team_a_id != null && <option value={m.team_a_id}>{m.team_a_name} forfeits</option>}
                              {m.team_b_id != null && <option value={m.team_b_id}>{m.team_b_name} forfeits</option>}
                            </select>
                            <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => saveResult(m)}>
                              Save
                            </button>
                          </span>
                        )}
                      </div>
                    )
                  })}
              </div>
            </div>
          ))}
        </section>
      )}

      {!config.timed_only && hasResults && (
        <section>
          <h3>Standings</h3>
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
                {data.standings.map((r, i) => (
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
        </section>
      )}
    </div>
  )
}
