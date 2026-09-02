import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import type { LaundryItem } from '../../types'

function LaundryAdmin() {
  const [items, setItems] = useState<LaundryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  function refresh() {
    setLoading(true)
    adminApi.laundry
      .list()
      .then((res) => setItems(res.items))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  const dirtyCount = items.filter((i) => i.stage === 'dirty').length

  async function handleAdd() {
    if (!newName.trim()) return
    try {
      await adminApi.laundry.create(newName.trim())
      setNewName('')
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleToggle(item: LaundryItem) {
    try {
      await adminApi.laundry.update(item.id, { stage: item.stage === 'clean' ? 'dirty' : 'clean' })
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Remove this item?')) return
    try {
      await adminApi.laundry.remove(id)
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleDidLaundry() {
    setBusy(true)
    try {
      await adminApi.laundry.cleanAll()
      refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="admin-main-head">
        <h2>Laundry</h2>
        <button
          className="approve-btn"
          type="button"
          disabled={busy || dirtyCount === 0}
          onClick={handleDidLaundry}
        >
          {busy ? 'Washing…' : `Did laundry (${dirtyCount} dirty)`}
        </button>
      </div>
      {error && <p className="admin-error">{error}</p>}
      <div className="admin-form">
        <input
          placeholder="Item name (e.g. Home jerseys)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button className="add-btn" type="button" onClick={handleAdd}>
          + Add item
        </button>
      </div>
      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Stage</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={3}>Loading&hellip;</td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={3}>No laundry items yet.</td>
              </tr>
            )}
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>
                  <span className={`status-chip status-${item.stage === 'clean' ? 'approved' : 'denied'}`}>
                    {item.stage}
                  </span>
                </td>
                <td>
                  <span className="row-actions">
                    <button type="button" onClick={() => handleToggle(item)}>
                      Mark {item.stage === 'clean' ? 'dirty' : 'clean'}
                    </button>
                    <button type="button" className="danger" onClick={() => handleDelete(item.id)}>
                      Delete
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

export default LaundryAdmin
