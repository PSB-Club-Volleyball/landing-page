import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import type { BoardMember } from '../../types'

const emptyDraft = { season: '', role: '', first_name: '', last_name: '', email: '' }
type Draft = typeof emptyDraft

function toInput(draft: Draft) {
  return {
    season: draft.season,
    role: draft.role,
    first_name: draft.first_name,
    last_name: draft.last_name,
    email: draft.email || null,
  }
}

function memberToDraft(m: BoardMember): Draft {
  return {
    season: m.season,
    role: m.role,
    first_name: m.first_name,
    last_name: m.last_name,
    email: m.email ?? '',
  }
}

function BoardAdmin({ isOwner }: { isOwner: boolean }) {
  const [members, setMembers] = useState<BoardMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft)
  const [creating, setCreating] = useState(false)
  const [createDraft, setCreateDraft] = useState<Draft>(emptyDraft)

  function refresh() {
    setLoading(true)
    adminApi.board
      .list()
      .then((res) => setMembers(res.board))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  async function handleCreate() {
    try {
      await adminApi.board.create(toInput(createDraft))
      setCreating(false)
      setCreateDraft(emptyDraft)
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleSave(id: number) {
    try {
      await adminApi.board.update(id, toInput(editDraft))
      setEditingId(null)
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Remove this board member?')) return
    try {
      await adminApi.board.remove(id)
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <>
      <div className="admin-main-head">
        <h2>Board</h2>
        <button className="add-btn" type="button" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Cancel' : '+ Add board member'}
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
            placeholder="Role"
            value={createDraft.role}
            onChange={(e) => setCreateDraft({ ...createDraft, role: e.target.value })}
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
            placeholder="Email (optional)"
            value={createDraft.email}
            onChange={(e) => setCreateDraft({ ...createDraft, email: e.target.value })}
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
              <th>Role</th>
              <th>Name</th>
              <th>Email</th>
              <th>Season</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5}>Loading&hellip;</td>
              </tr>
            )}
            {!loading && members.length === 0 && (
              <tr>
                <td colSpan={5}>No board members yet.</td>
              </tr>
            )}
            {members.map((m) =>
              editingId === m.id ? (
                <tr key={m.id}>
                  <td>
                    <input
                      value={editDraft.role}
                      onChange={(e) => setEditDraft({ ...editDraft, role: e.target.value })}
                      style={{ width: '8rem' }}
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
                      value={editDraft.email}
                      onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })}
                      style={{ width: '9rem' }}
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
                      <button type="button" onClick={() => handleSave(m.id)}>
                        Save
                      </button>
                      <button type="button" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </span>
                  </td>
                </tr>
              ) : (
                <tr key={m.id}>
                  <td>{m.role}</td>
                  <td>
                    {m.first_name} {m.last_name}
                  </td>
                  <td>{m.email ?? '—'}</td>
                  <td>{m.season}</td>
                  <td>
                    <span className="row-actions">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(m.id)
                          setEditDraft(memberToDraft(m))
                        }}
                      >
                        Edit
                      </button>
                      {isOwner && (
                        <button type="button" className="danger" onClick={() => handleDelete(m.id)}>
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

export default BoardAdmin
