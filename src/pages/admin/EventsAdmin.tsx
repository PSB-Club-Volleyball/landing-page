import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import type { ClubEvent, EventStatus } from '../../types'

const emptyDraft = {
  title: '',
  event_type: 'practice',
  start_time: '',
  end_time: '',
  location_name: '',
  status: 'draft' as EventStatus,
  description: '',
}
type Draft = typeof emptyDraft

function toInput(draft: Draft) {
  return {
    title: draft.title,
    event_type: draft.event_type,
    start_time: draft.start_time,
    end_time: draft.end_time || null,
    location_name: draft.location_name || null,
    status: draft.status,
    description: draft.description || null,
  }
}

function eventToDraft(e: ClubEvent): Draft {
  return {
    title: e.title,
    event_type: e.event_type,
    start_time: e.start_time,
    end_time: e.end_time ?? '',
    location_name: e.location_name ?? '',
    status: e.status,
    description: e.description ?? '',
  }
}

function EventsAdmin() {
  const [events, setEvents] = useState<ClubEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft)
  const [creating, setCreating] = useState(false)
  const [createDraft, setCreateDraft] = useState<Draft>(emptyDraft)

  function refresh() {
    setLoading(true)
    adminApi.events
      .list()
      .then((res) => setEvents(res.events))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  async function handleCreate() {
    try {
      await adminApi.events.create(toInput(createDraft))
      setCreating(false)
      setCreateDraft(emptyDraft)
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleSave(id: number) {
    try {
      await adminApi.events.update(id, toInput(editDraft))
      setEditingId(null)
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Remove this event?')) return
    try {
      await adminApi.events.remove(id)
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <>
      <div className="admin-main-head">
        <h2>Events</h2>
        <button className="add-btn" type="button" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Cancel' : '+ Add event'}
        </button>
      </div>
      {error && <p className="admin-error">{error}</p>}
      {creating && (
        <div className="admin-form">
          <input
            placeholder="Title"
            value={createDraft.title}
            onChange={(e) => setCreateDraft({ ...createDraft, title: e.target.value })}
          />
          <input
            placeholder="Type (practice/tournament/open_gym/game/social)"
            value={createDraft.event_type}
            onChange={(e) => setCreateDraft({ ...createDraft, event_type: e.target.value })}
          />
          <input
            type="datetime-local"
            value={createDraft.start_time}
            onChange={(e) => setCreateDraft({ ...createDraft, start_time: e.target.value })}
          />
          <input
            placeholder="Location"
            value={createDraft.location_name}
            onChange={(e) => setCreateDraft({ ...createDraft, location_name: e.target.value })}
          />
          <select
            value={createDraft.status}
            onChange={(e) => setCreateDraft({ ...createDraft, status: e.target.value as EventStatus })}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button className="approve-btn" type="button" onClick={handleCreate}>
            Save
          </button>
        </div>
      )}
      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Starts</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5}>Loading&hellip;</td>
              </tr>
            )}
            {!loading && events.length === 0 && (
              <tr>
                <td colSpan={5}>No events yet.</td>
              </tr>
            )}
            {events.map((ev) =>
              editingId === ev.id ? (
                <tr key={ev.id}>
                  <td>
                    <input
                      value={editDraft.title}
                      onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                      style={{ width: '8rem' }}
                    />
                  </td>
                  <td>
                    <input
                      value={editDraft.event_type}
                      onChange={(e) => setEditDraft({ ...editDraft, event_type: e.target.value })}
                      style={{ width: '7rem' }}
                    />
                  </td>
                  <td>
                    <input
                      type="datetime-local"
                      value={editDraft.start_time}
                      onChange={(e) => setEditDraft({ ...editDraft, start_time: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      value={editDraft.status}
                      onChange={(e) => setEditDraft({ ...editDraft, status: e.target.value as EventStatus })}
                    >
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </td>
                  <td>
                    <span className="row-actions">
                      <button type="button" onClick={() => handleSave(ev.id)}>
                        Save
                      </button>
                      <button type="button" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </span>
                  </td>
                </tr>
              ) : (
                <tr key={ev.id}>
                  <td>{ev.title}</td>
                  <td>{ev.event_type}</td>
                  <td>{new Date(ev.start_time).toLocaleString()}</td>
                  <td>
                    <span className={`status-chip status-${ev.status}`}>{ev.status}</span>
                  </td>
                  <td>
                    <span className="row-actions">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(ev.id)
                          setEditDraft(eventToDraft(ev))
                        }}
                      >
                        Edit
                      </button>
                      <button type="button" className="danger" onClick={() => handleDelete(ev.id)}>
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

export default EventsAdmin
