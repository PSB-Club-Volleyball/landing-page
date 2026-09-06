import { useEffect, useRef, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import BulkActionBar from '../../components/admin/BulkActionBar'
import { runBulk, summarizeBulk } from '../../lib/bulk'
import { csvRowsToObjects, downloadCsv, parseCsv, toCsv } from '../../lib/csv'
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

function toInput(draft: Draft) {
  return {
    season: draft.season,
    first_name: draft.first_name,
    last_name: draft.last_name,
    jersey_number: draft.jersey_number ? Number(draft.jersey_number) : null,
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

function RosterAdmin({ isOwner }: { isOwner: boolean }) {
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

  async function handleCreate() {
    try {
      await adminApi.roster.create(toInput(createDraft))
      setCreating(false)
      setCreateDraft(emptyDraft)
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleSave(id: number) {
    try {
      await adminApi.roster.update(id, toInput(editDraft))
      setEditingId(null)
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Remove this player?')) return
    try {
      await adminApi.roster.remove(id)
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function applyBulkSeason() {
    if (!bulkSeason.trim()) return
    setBulkBusy(true)
    const targets = players.filter((p) => selection.isSelected(p.id))
    const result = await runBulk(targets, (p) => adminApi.roster.update(p.id, { season: bulkSeason.trim() }))
    setError(summarizeBulk(result, 'Bulk season update'))
    selection.clear()
    refresh()
    setBulkBusy(false)
  }

  async function handleBulkDelete() {
    if (!confirm(`Remove ${selection.selected.size} player(s)? This can't be undone.`)) return
    setBulkBusy(true)
    const result = await runBulk([...selection.selected], (id) => adminApi.roster.remove(id))
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
      const result = await runBulk(toImport, (r) =>
        adminApi.roster.create({
          season: r.season,
          first_name: r.first_name,
          last_name: r.last_name,
          jersey_number: r.jersey_number ? Number(r.jersey_number) : null,
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
          <button className="approve-btn" type="button" onClick={handleCreate}>
            Save
          </button>
        </div>
      )}
      <BulkActionBar count={selection.selected.size} onClear={selection.clear}>
        <input
          placeholder="Season (2025-2026)"
          value={bulkSeason}
          onChange={(e) => setBulkSeason(e.target.value)}
          style={{ width: '9rem' }}
        />
        <button type="button" disabled={bulkBusy || !bulkSeason.trim()} onClick={applyBulkSeason}>
          Set season
        </button>
        {isOwner && (
          <button type="button" className="danger" disabled={bulkBusy} onClick={handleBulkDelete}>
            Delete selected
          </button>
        )}
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
                      <button type="button" onClick={() => handleSave(p.id)}>
                        Save
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
                  <td>{p.season}</td>
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
                      {isOwner && (
                        <button type="button" className="danger" onClick={() => handleDelete(p.id)}>
                          Delete
                        </button>
                      )}
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
