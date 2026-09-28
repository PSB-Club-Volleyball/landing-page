import { useEffect, useRef, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import BulkActionBar from '../../components/admin/BulkActionBar'
import { runBulk, summarizeBulk } from '../../lib/bulk'
import { csvRowsToObjects, downloadCsv, downloadEmailList, parseCsv, toCsv } from '../../lib/csv'
import { useSelection } from '../../lib/useSelection'
import type { Player } from '../../types'

const ROSTER_CSV_COLUMNS: Record<string, string> = {
  season: 'season',
  'first name': 'first_name',
  first_name: 'first_name',
  'last name': 'last_name',
  last_name: 'last_name',
  '#': 'jersey_number',
  number: 'jersey_number',
  jersey: 'jersey_number',
  jersey_number: 'jersey_number',
  'jersey #': 'jersey_number',
  position: 'position',
  class: 'class_year',
  'class year': 'class_year',
  class_year: 'class_year',
}

function exportRosterCsv(players: Player[]) {
  const csv = toCsv(
    ['Season', 'First name', 'Last name', 'Jersey #', 'Position', 'Class'],
    players.map((p) => [p.season, p.first_name, p.last_name, p.jersey_number, p.position, p.class_year])
  )
  downloadCsv('roster.csv', csv)
}

const emptyDraft = {
  season: '',
  first_name: '',
  last_name: '',
  jersey_number: '',
  position: '',
  class_year: '',
}
type Draft = typeof emptyDraft

// Blank means no number; anything but a whole number ("12a", "7.5") is an
// error rather than being silently saved as blank.
function parseJersey(raw: string): number | null {
  const v = raw.trim()
  if (v === '') return null
  if (!/^\d+$/.test(v)) throw new Error(`Jersey number must be a whole number (got "${raw}").`)
  return Number(v)
}

function toInput(draft: Draft) {
  return {
    season: draft.season,
    first_name: draft.first_name,
    last_name: draft.last_name,
    jersey_number: parseJersey(draft.jersey_number),
    position: draft.position || null,
    class_year: draft.class_year || null,
  }
}

function playerToDraft(p: Player): Draft {
  return {
    season: p.season,
    first_name: p.first_name,
    last_name: p.last_name,
    jersey_number: p.jersey_number?.toString() ?? '',
    position: p.position ?? '',
    class_year: p.class_year ?? '',
  }
}

function RosterAdmin({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft)
  const [creating, setCreating] = useState(false)
  const [createDraft, setCreateDraft] = useState<Draft>(emptyDraft)
  const selection = useSelection()
  const [bulkSeason, setBulkSeason] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function refresh() {
    setLoading(true)
    adminApi.roster
      .list()
      .then((res) => setPlayers(res.players))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  const editingPlayer = editingId === null ? undefined : players.find((p) => p.id === editingId)
  const dirty =
    (creating && JSON.stringify(createDraft) !== JSON.stringify(emptyDraft)) ||
    (editingPlayer !== undefined && JSON.stringify(editDraft) !== JSON.stringify(playerToDraft(editingPlayer)))
  useEffect(() => {
    onDirtyChange?.(dirty)
    return () => onDirtyChange?.(false)
  }, [dirty, onDirtyChange])

  async function handleCreate() {
    if (saving) return
    setSaving(true)
    try {
      await adminApi.roster.create(toInput(createDraft))
      setCreating(false)
      setCreateDraft(emptyDraft)
      refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSave(id: number) {
    if (saving) return
    setSaving(true)
    try {
      await adminApi.roster.update(id, toInput(editDraft))
      setEditingId(null)
      refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Remove this player?')) return
    try {
      await adminApi.roster.remove(id)
      if (selection.isSelected(id)) selection.toggle(id)
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // Bulk actions only touch checked rows that are still in the list — never
  // an id left over from a player deleted since it was checked.
  const selectedPlayers = players.filter((p) => selection.isSelected(p.id))

  async function applyBulkSeason() {
    if (!bulkSeason.trim()) return
    setBulkBusy(true)
    const result = await runBulk(selectedPlayers, (p) => adminApi.roster.update(p.id, { season: bulkSeason.trim() }))
    setError(summarizeBulk(result, 'Bulk season update'))
    selection.clear()
    refresh()
    setBulkBusy(false)
  }

  async function handleBulkDelete() {
    if (!confirm(`Remove ${selectedPlayers.length} player(s)? This can't be undone.`)) return
    setBulkBusy(true)
    const result = await runBulk(selectedPlayers, (p) => adminApi.roster.remove(p.id))
    setError(summarizeBulk(result, 'Bulk delete'))
    selection.clear()
    refresh()
    setBulkBusy(false)
  }

  async function handleImportFile(file: File) {
    setImporting(true)
    setError(null)
    try {
      const rows = parseCsv(await file.text())
      const records = csvRowsToObjects(rows, ROSTER_CSV_COLUMNS)
      const toImport = records.filter((r) => r.season && r.first_name && r.last_name)
      if (toImport.length === 0) {
        setError('No rows with a season, first name, and last name were found in that file.')
        return
      }
      // Reject the whole file up front on a bad jersey number rather than
      // importing the rest and leaving a half-applied roster.
      const badJersey = toImport.filter((r) => r.jersey_number && !/^\d+$/.test(r.jersey_number))
      if (badJersey.length > 0) {
        setError(
          `Import cancelled — jersey numbers must be whole numbers: ${badJersey
            .map((r) => `${r.first_name} ${r.last_name} ("${r.jersey_number}")`)
            .join(', ')}. Nothing was imported.`
        )
        return
      }
      const result = await runBulk(toImport, (r) =>
        adminApi.roster.create({
          season: r.season,
          first_name: r.first_name,
          last_name: r.last_name,
          jersey_number: parseJersey(r.jersey_number ?? ''),
          position: r.position || null,
          class_year: r.class_year || null,
        })
      )
      setError(summarizeBulk(result, 'Import'))
      refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <div className="admin-main-head">
        <h2>Roster</h2>
        <span className="admin-head-actions">
          <button className="btn btn-outline btn-sm" type="button" onClick={() => exportRosterCsv(players)}>
            Download CSV
          </button>
          <button
            className="btn btn-outline btn-sm"
            type="button"
            disabled={!players.some((p) => p.email)}
            title="Email addresses from linked club accounts"
            onClick={() => downloadEmailList('roster-emails.csv', players.map((p) => p.email))}
          >
            Emails only
          </button>
          <button
            className="btn btn-outline btn-sm"
            type="button"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) handleImportFile(file)
            }}
          />
          <button className="add-btn" type="button" onClick={() => setCreating((v) => !v)}>
            {creating ? 'Cancel' : '+ Add player'}
          </button>
        </span>
      </div>
      {error && <p className="admin-error">{error}</p>}
      {creating && (
        <div className="admin-form">
          <input
            placeholder="Season (2025-2026)"
            value={createDraft.season}
            onChange={(e) => setCreateDraft({ ...createDraft, season: e.target.value })}
          />
          <input
            placeholder="First name"
            value={createDraft.first_name}
            onChange={(e) => setCreateDraft({ ...createDraft, first_name: e.target.value })}
          />
          <input
            placeholder="Last name"
            value={createDraft.last_name}
            onChange={(e) => setCreateDraft({ ...createDraft, last_name: e.target.value })}
          />
          <input
            placeholder="#"
            value={createDraft.jersey_number}
            onChange={(e) => setCreateDraft({ ...createDraft, jersey_number: e.target.value })}
          />
          <input
            placeholder="Position"
            value={createDraft.position}
            onChange={(e) => setCreateDraft({ ...createDraft, position: e.target.value })}
          />
          <input
            placeholder="Class (Fr/So/Jr/Sr)"
            value={createDraft.class_year}
            onChange={(e) => setCreateDraft({ ...createDraft, class_year: e.target.value })}
          />
          <button className="approve-btn" type="button" disabled={saving} onClick={handleCreate}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
      <BulkActionBar count={selectedPlayers.length} onClear={selection.clear}>
        <input
          placeholder="Season (2025-2026)"
          value={bulkSeason}
          onChange={(e) => setBulkSeason(e.target.value)}
          style={{ width: '9rem' }}
        />
        <button type="button" disabled={bulkBusy || !bulkSeason.trim()} onClick={applyBulkSeason}>
          Set season
        </button>
        <button type="button" className="danger" disabled={bulkBusy} onClick={handleBulkDelete}>
          Delete selected
        </button>
      </BulkActionBar>
      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th className="select-col">
                <input
                  type="checkbox"
                  checked={players.length > 0 && players.every((p) => selection.isSelected(p.id))}
                  onChange={() => selection.toggleAll(players.map((p) => p.id))}
                />
              </th>
              <th>#</th>
              <th>Name</th>
              <th>Position</th>
              <th>Class</th>
              <th>Season</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7}>Loading&hellip;</td>
              </tr>
            )}
            {!loading && players.length === 0 && (
              <tr>
                <td colSpan={7}>No players yet.</td>
              </tr>
            )}
            {players.map((p) =>
              editingId === p.id ? (
                <tr key={p.id}>
                  <td className="select-col">
                    <input type="checkbox" checked={selection.isSelected(p.id)} onChange={() => selection.toggle(p.id)} />
                  </td>
                  <td>
                    <input
                      value={editDraft.jersey_number}
                      onChange={(e) => setEditDraft({ ...editDraft, jersey_number: e.target.value })}
                      style={{ width: '3rem' }}
                    />
                  </td>
                  <td>
                    <input
                      value={editDraft.first_name}
                      onChange={(e) => setEditDraft({ ...editDraft, first_name: e.target.value })}
                      style={{ width: '6rem' }}
                    />{' '}
                    <input
                      value={editDraft.last_name}
                      onChange={(e) => setEditDraft({ ...editDraft, last_name: e.target.value })}
                      style={{ width: '6rem' }}
                    />
                  </td>
                  <td>
                    <input
                      value={editDraft.position}
                      onChange={(e) => setEditDraft({ ...editDraft, position: e.target.value })}
                      style={{ width: '7rem' }}
                    />
                  </td>
                  <td>
                    <input
                      value={editDraft.class_year}
                      onChange={(e) => setEditDraft({ ...editDraft, class_year: e.target.value })}
                      style={{ width: '5rem' }}
                    />
                  </td>
                  <td>
                    <input
                      value={editDraft.season}
                      onChange={(e) => setEditDraft({ ...editDraft, season: e.target.value })}
                      style={{ width: '6rem' }}
                    />
                  </td>
                  <td>
                    <span className="row-actions">
                      <button type="button" disabled={saving} onClick={() => handleSave(p.id)}>
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button type="button" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </span>
                  </td>
                </tr>
              ) : (
                <tr key={p.id}>
                  <td className="select-col">
                    <input type="checkbox" checked={selection.isSelected(p.id)} onChange={() => selection.toggle(p.id)} />
                  </td>
                  <td className="num-cell">{p.jersey_number ?? '—'}</td>
                  <td>
                    {p.first_name} {p.last_name}
                  </td>
                  <td>{p.position ?? '—'}</td>
                  <td>{p.class_year ?? '—'}</td>
                  <td className="nowrap">{p.season}</td>
                  <td>
                    <span className="row-actions">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(p.id)
                          setEditDraft(playerToDraft(p))
                        }}
                      >
                        Edit
                      </button>
                      <button type="button" className="danger" onClick={() => handleDelete(p.id)}>
                        Delete
                      </button>
                    </span>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

export default RosterAdmin
