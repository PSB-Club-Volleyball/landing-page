import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import BulkActionBar from '../../components/admin/BulkActionBar'
import { runBulk, summarizeBulk } from '../../lib/bulk'
import { useSelection } from '../../lib/useSelection'
import type { BoardMember, AdminUser, Player } from '../../types'

const emptyDraft = { season: '', role: '', first_name: '', last_name: '', email: '' }
type Draft = typeof emptyDraft

// Roles the club always wants filled; they're offered as standing slots
// (each with its own fuzzy-search box) rather than typed in by hand.
const FIXED_ROLES = ['President', 'Vice President', 'Treasurer', 'Secretary', 'Social Media Manager']

const SEARCH_DEBOUNCE_MS = 250

// A person to pull name/email from when adding a board member, rather than
// typing them in from scratch — either an approved club member (account) or
// a roster player. `source` disambiguates the id namespace on selection.
type Person = { source: 'member'; id: number; first_name: string; last_name: string; email: string } | { source: 'player'; id: number; first_name: string; last_name: string; email: string }

function splitName(name: string): { first_name: string; last_name: string } {
  const [first_name, ...rest] = name.trim().split(/\s+/)
  return { first_name: first_name ?? '', last_name: rest.join(' ') }
}

function userToPerson(u: AdminUser): Person {
  return { source: 'member', id: u.id, email: u.email, ...splitName(u.name || u.email) }
}

function playerToPerson(p: Player): Person {
  return { source: 'player', id: p.id, first_name: p.first_name, last_name: p.last_name, email: '' }
}

// Subsequence-based fuzzy match: every character of the query must appear
// in the target, in order, but not necessarily adjacent — forgiving of
// typos and partial names ("jsmi" still matches "John Smith").
function fuzzyMatch(query: string, target: string): boolean {
  let qi = 0
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

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

// One always-present role (President, Treasurer, etc.). Shows a fuzzy-search
// box against club members/players while unfilled, and just the assigned
// person once one is picked — the search box has no reason to stick around
// after that.
function RoleSlot({
  role,
  season,
  assigned,
  people,
  isOwner,
  onAssign,
  onUnassign,
}: {
  role: string
  season: string | null
  assigned: BoardMember | null
  people: Person[]
  isOwner: boolean
  onAssign: (person: Person) => void
  onUnassign: (id: number) => void
}) {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)

  const matches =
    debouncedQuery.trim().length === 0
      ? []
      : people.filter((p) => fuzzyMatch(debouncedQuery, `${p.first_name} ${p.last_name}`)).slice(0, 6)

  return (
    <div className="board-role-row">
      <span className="board-role-label">{role}</span>
      {assigned ? (
        <span className="board-role-assigned">
          {assigned.first_name} {assigned.last_name}
          {isOwner && (
            <button type="button" className="board-role-clear" onClick={() => onUnassign(assigned.id)}>
              Change
            </button>
          )}
        </span>
      ) : (
        <div className="board-role-search">
          <input
            placeholder={season ? 'Search club members/players…' : 'Set a season first'}
            value={query}
            disabled={!season}
            onChange={(e) => setQuery(e.target.value)}
          />
          {debouncedQuery.trim().length > 0 && (
            <div className="board-role-suggestions">
              {matches.length === 0 ? (
                <div className="board-role-suggestion-empty">No matches</div>
              ) : (
                matches.map((p) => (
                  <button
                    type="button"
                    key={`${p.source}:${p.id}`}
                    className="board-role-suggestion"
                    onClick={() => {
                      onAssign(p)
                      setQuery('')
                    }}
                  >
                    {p.first_name} {p.last_name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function BoardAdmin({ isOwner }: { isOwner: boolean }) {
  const [members, setMembers] = useState<BoardMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft)
  const [clubMembers, setClubMembers] = useState<AdminUser[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  // The role-slot section always assigns into whatever season is set as
  // current (Settings tab) — no separate season picker here to keep in sync.
  const [season, setSeason] = useState<string | null>(null)
  const selection = useSelection()
  const [bulkBusy, setBulkBusy] = useState(false)

  function refresh() {
    setLoading(true)
    adminApi.board
      .list()
      .then((res) => setMembers(res.board))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])
  useEffect(() => {
    adminApi.users
      .list()
      .then((res) => setClubMembers(res.users))
      .catch(() => {})
    adminApi.roster
      .list()
      .then((res) => setPlayers(res.players))
      .catch(() => {})
    adminApi.settings
      .get()
      .then((res) => setSeason(res.current_season))
      .catch(() => {})
  }, [])

  const people: Person[] = [...clubMembers.map(userToPerson), ...players.map(playerToPerson)]

  async function assignRole(role: string, person: Person) {
    if (!season) return
    try {
      await adminApi.board.create({
        season,
        role,
        first_name: person.first_name,
        last_name: person.last_name,
        email: person.email || null,
      })
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

  async function handleBulkDelete() {
    if (!confirm(`Remove ${selection.selected.size} board member(s)?`)) return
    setBulkBusy(true)
    const result = await runBulk([...selection.selected], (id) => adminApi.board.remove(id))
    setError(summarizeBulk(result, 'Bulk delete'))
    selection.clear()
    refresh()
    setBulkBusy(false)
  }

  return (
    <>
      <div className="admin-main-head">
        <h2>Board</h2>
      </div>
      {error && <p className="admin-error">{error}</p>}
      {!season && (
        <p className="admin-note">
          No current season is set — an owner can set one in Settings before role slots can be assigned.
        </p>
      )}
      <div className="board-roles">
        {FIXED_ROLES.map((role) => (
          <RoleSlot
            key={role}
            role={role}
            season={season}
            assigned={members.find((m) => m.season === season && m.role === role) ?? null}
            people={people}
            isOwner={isOwner}
            onAssign={(person) => assignRole(role, person)}
            onUnassign={handleDelete}
          />
        ))}
      </div>
      <BulkActionBar count={selection.selected.size} onClear={selection.clear}>
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
                  checked={members.length > 0 && members.every((m) => selection.isSelected(m.id))}
                  onChange={() => selection.toggleAll(members.map((m) => m.id))}
                />
              </th>
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
                <td colSpan={6}>Loading&hellip;</td>
              </tr>
            )}
            {!loading && members.length === 0 && (
              <tr>
                <td colSpan={6}>No board members yet.</td>
              </tr>
            )}
            {members.map((m) =>
              editingId === m.id ? (
                <tr key={m.id}>
                  <td className="select-col">
                    <input type="checkbox" checked={selection.isSelected(m.id)} onChange={() => selection.toggle(m.id)} />
                  </td>
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
                  <td className="select-col">
                    <input type="checkbox" checked={selection.isSelected(m.id)} onChange={() => selection.toggle(m.id)} />
                  </td>
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
