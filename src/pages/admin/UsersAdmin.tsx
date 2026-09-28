import { Fragment, useEffect, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import BulkActionBar from '../../components/admin/BulkActionBar'
import { runBulk, summarizeBulk } from '../../lib/bulk'
import { downloadCsv, downloadEmailList, toCsv } from '../../lib/csv'
import { useSelection } from '../../lib/useSelection'
import type { AdminUser, AuthUser, SkillLevel, Team, UserRole } from '../../types'

// No CSV import here: accounts are created by signing in (OAuth), not by an
// admin typing rows into a spreadsheet, so there's no legitimate "create a
// user from a CSV" action to offer.
function exportUsersCsv(users: AdminUser[]) {
  const csv = toCsv(
    ['Name', 'Email', 'Role', 'Position', 'Team', 'Skill level', 'Waiver signed year', 'Dues paid year', 'RSVP restricted'],
    users.map((u) => [
      u.name,
      u.email,
      u.role,
      u.position,
      u.team,
      u.skill_level,
      u.waiver_signed_year,
      u.dues_paid_year,
      u.rsvp_restricted ? 'yes' : 'no',
    ])
  )
  downloadCsv('users.csv', csv)
}

const ROLE_LABELS: Record<UserRole, string> = {
  outsider: 'Outsider',
  club_member: 'Club member',
  admin: 'Admin',
  owner: 'Owner',
}

const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

type Filter = 'everyone' | 'waiver-missing' | 'dues-unpaid' | 'skill-request'

// UTC, matching the server's getUTCFullYear() when it stamps the year.
const currentYear = () => new Date().getUTCFullYear()
const paysDues = (role: UserRole) => role === 'club_member' || role === 'admin'

function matchesFilter(u: AdminUser, filter: Filter): boolean {
  const year = currentYear()
  switch (filter) {
    case 'everyone':
      return true
    case 'waiver-missing':
      return u.waiver_signed_year !== year
    case 'dues-unpaid':
      return paysDues(u.role) && u.dues_paid_year !== year
    case 'skill-request':
      return u.skill_level_change_requested !== null
  }
}

// The compact, read-only row. Everything editable lives in UserEditor,
// opened below the row by Edit.
function UserSummaryRow({
  user,
  selected,
  onToggleSelected,
  editing,
  onEdit,
}: {
  user: AdminUser
  selected: boolean | null
  onToggleSelected: () => void
  editing: boolean
  onEdit: (() => void) | null
}) {
  const year = currentYear()
  const waiverCurrent = user.waiver_signed_year === year
  const duesCurrent = user.dues_paid_year === year
  const posTeam = [user.position, user.team].filter(Boolean).join(' · ')
  return (
    <tr className={editing ? 'user-row editing' : 'user-row'}>
      <td className="select-col">
        {selected !== null && (
          <input
            type="checkbox"
            aria-label={`Select ${user.name || user.email}`}
            checked={selected}
            onChange={onToggleSelected}
          />
        )}
      </td>
      <td className="user-person">
        <b>{user.name || 'No name'}</b>
        <span>{user.email}</span>
      </td>
      <td className="user-role">
        <span className={`role-chip role-${user.role}`}>{ROLE_LABELS[user.role]}</span>
      </td>
      <td className={posTeam ? 'user-pos' : 'user-pos admin-muted'}>{posTeam || 'Not set'}</td>
      <td className="user-skill">
        <span className={user.skill_level ? undefined : 'admin-muted'}>
          {user.skill_level ? SKILL_LEVEL_LABELS[user.skill_level] : 'Not set'}
        </span>
        {user.skill_level_change_requested && (
          <span className="lock-chip requested">Wants {SKILL_LEVEL_LABELS[user.skill_level_change_requested]}</span>
        )}
      </td>
      <td className="user-status">
        {/* Waivers are required of everyone who sets foot on the court,
            outsiders included; dues only of club members and admins. */}
        <span
          className={waiverCurrent ? 'waiver-chip' : 'waiver-chip no'}
          title={
            user.waiver_signed_year
              ? waiverCurrent
                ? `Waiver signed ${user.waiver_signed_year}`
                : `Waiver expired (${user.waiver_signed_year})`
              : 'Waiver not signed'
          }
        >
          Waiver
        </span>
        {paysDues(user.role) && (
          <span
            className={duesCurrent ? 'waiver-chip' : 'waiver-chip no'}
            title={
              user.dues_paid_year
                ? duesCurrent
                  ? `Dues paid ${user.dues_paid_year}`
                  : `Dues expired (${user.dues_paid_year})`
                : 'Dues not paid'
            }
          >
            Dues
          </span>
        )}
        {user.rsvp_restricted && <span className="waiver-chip no">RSVP limited</span>}
      </td>
      <td className="user-edit">
        {onEdit && (
          <button
            type="button"
            className={editing ? 'btn btn-sm btn-ink' : 'btn btn-outline btn-sm'}
            aria-expanded={editing}
            onClick={onEdit}
          >
            {editing ? 'Close' : 'Edit'}
          </button>
        )}
      </td>
    </tr>
  )
}

function UserEditor({
  user,
  isOwner,
  onClose,
  onSaved,
  onError,
  onRemove,
  onDirtyChange,
}: {
  user: AdminUser
  isOwner: boolean
  onClose: () => void
  onDirtyChange: (dirty: boolean) => void
  onSaved: () => void
  onError: (msg: string) => void
  onRemove: () => void
}) {
  const year = currentYear()
  const waiverCurrent = user.waiver_signed_year === year
  const duesCurrent = user.dues_paid_year === year
  const [role, setRole] = useState<Exclude<UserRole, 'owner'>>(user.role === 'owner' ? 'admin' : user.role)
  const [name, setName] = useState(user.name ?? '')
  const [position, setPosition] = useState(user.position ?? '')
  const [team, setTeam] = useState<Team | ''>(user.team ?? '')
  const [skillLevel, setSkillLevel] = useState<SkillLevel | ''>(user.skill_level ?? '')
  const [locked, setLocked] = useState(user.skill_level_locked)
  const [waiver, setWaiver] = useState(waiverCurrent)
  const [dues, setDues] = useState(duesCurrent)
  const [restricted, setRestricted] = useState(user.rsvp_restricted)
  const [saving, setSaving] = useState(false)

  // Only the owner may re-role a row that's currently admin — even the
  // admin's own row. Everything else here (name, position, team, skill,
  // waiver, dues, RSVP limit) any admin can edit, including their own.
  const ownerOnly = !isOwner && user.role === 'admin'
  const roleOptions: Exclude<UserRole, 'owner'>[] = isOwner
    ? ['outsider', 'club_member', 'admin']
    : ['outsider', 'club_member']
  const member = paysDues(role)

  // Only the fields that changed. skill_level in particular: the server
  // treats any skill_level write as resolving a pending change request, so
  // resending the current value alongside a name edit would silently drop
  // the member's request. Waiver/dues: checking an expired one renews it for
  // this year, and only a currently valid one unchecks to "not signed".
  const input = {
    ...(role !== user.role ? { role } : {}),
    ...(name.trim() !== (user.name ?? '') ? { name: name.trim() } : {}),
    ...(position !== (user.position ?? '') ? { position: position || null } : {}),
    ...(team !== (user.team ?? '') ? { team: team || null } : {}),
    ...(skillLevel !== (user.skill_level ?? '') ? { skill_level: skillLevel || null } : {}),
    ...(locked !== user.skill_level_locked ? { skill_level_locked: locked } : {}),
    ...(waiver !== waiverCurrent ? { waiver_signed: waiver } : {}),
    ...(member && dues !== duesCurrent ? { dues_paid: dues } : {}),
    ...(restricted !== user.rsvp_restricted ? { rsvp_restricted: restricted } : {}),
  }
  const dirty = Object.keys(input).length > 0
  useEffect(() => {
    onDirtyChange(dirty)
    return () => onDirtyChange(false)
  }, [dirty, onDirtyChange])

  async function run(body: Parameters<typeof adminApi.users.update>[1], close: boolean) {
    setSaving(true)
    try {
      await adminApi.users.update(user.id, body)
      onSaved()
      if (close) onClose()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    if (dirty && !confirm('Discard your changes to this user?')) return
    onClose()
  }

  const requested = user.skill_level_change_requested

  return (
    <tr className="user-editor-row">
      <td colSpan={7}>
        <div className="user-editor">
          <label className="field">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            Role
            {ownerOnly ? (
              <span className="field-static" title="Only the owner can change an admin's role">
                {ROLE_LABELS[user.role]}
              </span>
            ) : (
              <select value={role} onChange={(e) => setRole(e.target.value as Exclude<UserRole, 'owner'>)}>
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            )}
          </label>
          {member && (
            <>
              <label className="field">
                Position
                <input value={position} onChange={(e) => setPosition(e.target.value)} />
              </label>
              <label className="field">
                Team
                <select value={team} onChange={(e) => setTeam(e.target.value as Team | '')}>
                  <option value="">None</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                </select>
              </label>
            </>
          )}
          <div className="field user-editor-skill">
            {/* Self-editable once (from unset) on the member's own profile; a
                later change lands as a pending request instead. Lock takes
                self-editing away so the value set here sticks. */}
            <span>Skill level</span>
            <span className="user-editor-inline">
              <select
                aria-label="Skill level"
                value={skillLevel}
                onChange={(e) => setSkillLevel(e.target.value as SkillLevel | '')}
              >
                <option value="">Not set</option>
                {(Object.keys(SKILL_LEVEL_LABELS) as SkillLevel[]).map((level) => (
                  <option key={level} value={level}>
                    {SKILL_LEVEL_LABELS[level]}
                  </option>
                ))}
              </select>
              <label className="switch-row">
                <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} />
                Lock (they can&rsquo;t change it)
              </label>
            </span>
            {requested && (
              <span className="user-editor-request">
                Requested <b>{SKILL_LEVEL_LABELS[requested]}</b>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={saving}
                  onClick={() => {
                    setSkillLevel(requested)
                    run({ skill_level: requested }, false)
                  }}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={saving}
                  onClick={() => run({ skill_level_change_requested: null }, false)}
                >
                  Dismiss
                </button>
              </span>
            )}
          </div>
          <div className="field">
            <span>Paperwork ({year})</span>
            <label className="switch-row">
              <input type="checkbox" checked={waiver} onChange={(e) => setWaiver(e.target.checked)} />
              Waiver signed
              {user.waiver_signed_year !== null && !waiverCurrent && (
                <span className="field-hint">(expired {user.waiver_signed_year})</span>
              )}
            </label>
            {member && (
              <label className="switch-row">
                <input type="checkbox" checked={dues} onChange={(e) => setDues(e.target.checked)} />
                Dues paid
                {user.dues_paid_year !== null && !duesCurrent && (
                  <span className="field-hint">(expired {user.dues_paid_year})</span>
                )}
              </label>
            )}
          </div>
          <div className="field">
            <span>RSVPs</span>
            <label className="switch-row">
              <input type="checkbox" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} />
              Approve each RSVP by hand
            </label>
          </div>
          <div className="user-editor-actions">
            {!ownerOnly && (
              <button type="button" className="btn btn-outline btn-sm danger" disabled={saving} onClick={onRemove}>
                Delete account
              </button>
            )}
            <span className="form-actions-spacer" />
            <button type="button" className="btn btn-outline btn-sm" disabled={saving} onClick={cancel}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-ace btn-sm"
              disabled={!dirty || saving}
              onClick={() => run(input, true)}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </td>
    </tr>
  )
}

// Rows are ordered by role, admins first, so e.g. all club members sit
// together.
const ROLE_ORDER: UserRole[] = ['admin', 'club_member', 'outsider']

function UsersAdmin({
  currentUser,
  initialFilter,
  onDirtyChange,
}: {
  currentUser: AuthUser
  initialFilter: Filter | null
  // Unsaved input in the open editor, so the sidebar asks before leaving.
  onDirtyChange: (dirty: boolean) => void
}) {
  const isOwner = currentUser.role === 'owner'
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [transferTo, setTransferTo] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>(initialFilter ?? 'everyone')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editorDirty, setEditorDirty] = useState(false)
  useEffect(() => {
    onDirtyChange(editorDirty)
    return () => onDirtyChange(false)
  }, [editorDirty, onDirtyChange])
  const selection = useSelection()
  const [bulkRole, setBulkRole] = useState<Exclude<UserRole, 'owner'>>('club_member')
  const [bulkBusy, setBulkBusy] = useState(false)

  function refresh() {
    setLoading(true)
    adminApi.users
      .list()
      .then((res) => setUsers(res.users))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  async function remove(id: number, label: string) {
    if (!confirm(`Delete ${label}? This removes their account, sessions, and roster link. This can't be undone.`))
      return
    try {
      await adminApi.users.remove(id)
      if (selection.isSelected(id)) selection.toggle(id)
      setEditingId(null)
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // Only the checked rows the admin can currently see (search and filters
  // hide the rest); a non-owner can't re-role an admin, so those rows are
  // skipped up front instead of each failing server-side.
  async function applyBulkRole() {
    const skipped = isOwner ? [] : selectedVisible.filter((u) => u.role === 'admin')
    const targets = selectedVisible.filter((u) => !skipped.includes(u))
    setBulkBusy(true)
    const result = await runBulk(targets, (u) => adminApi.users.update(u.id, { role: bulkRole }))
    const skipNote =
      skipped.length > 0
        ? `Skipped ${skipped.length} admin${skipped.length === 1 ? '' : 's'} — only the owner can change an admin's role.`
        : null
    setError([summarizeBulk(result, 'Bulk role change'), skipNote].filter(Boolean).join(' ') || null)
    selection.clear()
    refresh()
    setBulkBusy(false)
  }

  async function transferOwnership() {
    const target = users.find((u) => u.id === Number(transferTo))
    if (!target) return
    const label = target.name || target.email
    if (!confirm(`Make ${label} the owner? You'll lose owner-only access immediately.`)) return
    try {
      await adminApi.users.transferOwnership(target.id)
      setTransferTo('')
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function toggleEditor(id: number) {
    // Closing the editor, or opening another row's, unmounts it: ask first
    // when it holds unsaved input.
    if (editorDirty && !confirm('Discard your unsaved changes to this user?')) return
    setEditingId(editingId === id ? null : id)
  }

  const owner = users.find((u) => u.role === 'owner')
  const query = search.trim().toLowerCase()
  const matchesQuery = (u: AdminUser) =>
    !query || (u.name ?? '').toLowerCase().includes(query) || u.email.toLowerCase().includes(query)
  // The row being edited stays listed even if a search, a filter, or its own
  // Approve/Dismiss stops it matching, so the editor never vanishes mid-edit.
  const others = users
    .filter((u) => u.role !== 'owner')
    .filter((u) => u.id === editingId || (matchesQuery(u) && matchesFilter(u, filter)))
    .sort(
      (a, b) =>
        ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) ||
        (a.name ?? a.email).localeCompare(b.name ?? b.email),
    )
  const showOwner = owner !== undefined && matchesQuery(owner) && matchesFilter(owner, filter)
  const transferCandidates = users.filter((u) => u.role !== 'owner')
  const selectedVisible = others.filter((u) => selection.isSelected(u.id))

  const filters: { key: Filter; label: string }[] = [
    { key: 'everyone', label: 'Everyone' },
    { key: 'waiver-missing', label: 'Waiver missing' },
    { key: 'dues-unpaid', label: 'Dues unpaid' },
    { key: 'skill-request', label: 'Skill request' },
  ]

  return (
    <>
      <div className="admin-main-head">
        <div>
          <h2>Users</h2>
          <p className="admin-page-desc">
            Everyone who has signed in. New accounts start as outsiders; promote club members and admins here.
            {!isOwner && ' Only the owner can grant admin or change an admin’s role.'}
          </p>
        </div>
        <span className="admin-head-actions">
          <button
            className="btn btn-outline btn-sm"
            type="button"
            disabled={!users.some((u) => u.email)}
            onClick={() => downloadEmailList('users-emails.csv', users.map((u) => u.email))}
          >
            Emails only
          </button>
          <button className="btn btn-outline btn-sm" type="button" onClick={() => exportUsersCsv(users)}>
            Download CSV
          </button>
        </span>
      </div>
      {error && <p className="admin-error">{error}</p>}
      {loading && users.length === 0 && <p className="admin-loading">Loading&hellip;</p>}

      {users.length > 0 && (
        <div className="admin-toolbar">
          <input
            type="search"
            className="mini-input users-search admin-toolbar-search"
            aria-label="Search users"
            placeholder="Search by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="admin-chips" role="group" aria-label="Show">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                className={filter === f.key ? 'active' : undefined}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
                {f.key !== 'everyone' && (
                  <span className="admin-segmented-count">{users.filter((u) => matchesFilter(u, f.key)).length}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <BulkActionBar count={selectedVisible.length} onClear={selection.clear}>
        <select value={bulkRole} onChange={(e) => setBulkRole(e.target.value as Exclude<UserRole, 'owner'>)}>
          <option value="outsider">Outsider</option>
          <option value="club_member">Club member</option>
          {isOwner && <option value="admin">Admin</option>}
        </select>
        <button type="button" disabled={bulkBusy} onClick={applyBulkRole}>
          Set role
        </button>
      </BulkActionBar>

      {users.length > 0 && (
        <div className="data-table users-table">
          <table>
            <thead>
              <tr>
                <th className="select-col">
                  <input
                    type="checkbox"
                    aria-label="Select all shown users"
                    checked={others.length > 0 && others.every((u) => selection.isSelected(u.id))}
                    onChange={() => selection.toggleAll(others.map((u) => u.id))}
                  />
                </th>
                <th>Person</th>
                <th>Role</th>
                <th>Position &middot; Team</th>
                <th>Skill</th>
                <th>Status</th>
                <th>
                  <span className="visually-hidden">Edit</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {showOwner && (
                // The owner row isn't editable here: its role changes only by
                // transferring ownership below.
                <UserSummaryRow user={owner} selected={null} onToggleSelected={() => {}} editing={false} onEdit={null} />
              )}
              {others.map((u) => (
                <Fragment key={u.id}>
                  <UserSummaryRow
                    user={u}
                    selected={selection.isSelected(u.id)}
                    onToggleSelected={() => selection.toggle(u.id)}
                    editing={editingId === u.id}
                    onEdit={() => toggleEditor(u.id)}
                  />
                  {editingId === u.id && (
                    <UserEditor
                      user={u}
                      isOwner={isOwner}
                      onClose={() => setEditingId(null)}
                      onSaved={refresh}
                      onError={setError}
                      onRemove={() => remove(u.id, u.name || u.email)}
                      onDirtyChange={setEditorDirty}
                    />
                  )}
                </Fragment>
              ))}
              {others.length === 0 && !showOwner && (
                <tr>
                  <td colSpan={7}>{query || filter !== 'everyone' ? 'No users match.' : 'No users yet.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {isOwner && transferCandidates.length > 0 && (
        <div className="admin-form">
          <span>Transfer ownership to:</span>
          <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
            <option value="">Select a user&hellip;</option>
            {transferCandidates.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </select>
          <button
            className="btn btn-outline btn-sm danger"
            type="button"
            disabled={!transferTo}
            onClick={transferOwnership}
          >
            Transfer ownership
          </button>
        </div>
      )}
    </>
  )
}

export default UsersAdmin
