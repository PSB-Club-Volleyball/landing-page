import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import type { Player } from '../../types'

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

function RosterAdmin() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft)
  const [creating, setCreating] = useState(false)
  const [createDraft, setCreateDraft] = useState<Draft>(emptyDraft)

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

  return (
    <>
      <div className="admin-main-head">
        <h2>Roster</h2>
        <button className="add-btn" type="button" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Cancel' : '+ Add player'}
        </button>
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
      <div className="data-table">
        <table>
          <thead>
            <tr>
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
                <td colSpan={6}>Loading&hellip;</td>
              </tr>
            )}
            {!loading && players.length === 0 && (
              <tr>
                <td colSpan={6}>No players yet.</td>
              </tr>
            )}
            {players.map((p) =>
              editingId === p.id ? (
                <tr key={p.id}>
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
