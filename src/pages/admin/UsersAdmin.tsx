import { Fragment, useEffect, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import type { AuthUser, PendingUser, Team, UserRole } from '../../types'

const ROLE_LABELS: Record<UserRole, string> = {
  outsider: 'Outsider',
  club_member: 'Club member',
  admin: 'Admin',
  owner: 'Owner',
}

function UserRow({
  user,
  isOwner,
  onSaved,
  onError,
  onDecide,
}: {
  user: PendingUser
  isOwner: boolean
  onSaved: () => void
  onError: (msg: string) => void
  onDecide: (status: 'approved' | 'denied') => void
}) {
  const [role, setRole] = useState<Exclude<UserRole, 'owner'>>(user.role === 'owner' ? 'admin' : user.role)
  const [name, setName] = useState(user.name ?? '')
  const [position, setPosition] = useState(user.position ?? '')
  const [team, setTeam] = useState<Team | ''>(user.team ?? '')
  const [saving, setSaving] = useState(false)
  const [waiverSaving, setWaiverSaving] = useState(false)
  const [duesSaving, setDuesSaving] = useState(false)

  const currentYear = new Date().getFullYear()
  const waiverCurrent = user.waiver_signed_year === currentYear
  const duesCurrent = user.dues_paid_year === currentYear

  async function toggleWaiver() {
    setWaiverSaving(true)
    try {
      // Signed-but-expired means "renew" (mark again for the current year),
      // not "unmark" — only a currently-valid waiver toggles off.
      await adminApi.users.update(user.id, { waiver_signed: !waiverCurrent })
      onSaved()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setWaiverSaving(false)
    }
  }

  async function toggleDues() {
    setDuesSaving(true)
    try {
      // Same "expired means renew" logic as the waiver toggle — only a
      // currently-valid payment toggles off.
      await adminApi.users.update(user.id, { dues_paid: !duesCurrent })
      onSaved()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setDuesSaving(false)
    }
  }

  // Only the owner may touch role, approval status, or admin-verified fields
  // (waiver/dues) on a row that's currently admin — even the admin's own row.
  // Basic profile fields (name/position/team) are never guarded — any admin
  // can edit any user's basic info, including another admin's.
  const ownerOnly = !isOwner && user.role === 'admin'
  const roleOptions: Exclude<UserRole, 'owner'>[] = isOwner
    ? ['outsider', 'club_member', 'admin']
    : ['outsider', 'club_member']

  const dirty =
    role !== user.role ||
    name.trim() !== (user.name ?? '') ||
    position !== (user.position ?? '') ||
    team !== (user.team ?? '')

  async function save() {
    setSaving(true)
    try {
      const trimmedName = name.trim()
      await adminApi.users.update(user.id, {
        ...(role !== user.role ? { role } : {}),
        ...(trimmedName !== (user.name ?? '') ? { name: trimmedName } : {}),
        position: position || null,
        team: team || null,
      })
      onSaved()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr>
      <td>
        <input
          className="mini-input"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </td>
      <td>{user.email}</td>
      <td>
        <span className={`status-chip status-${user.status}`}>{user.status}</span>
      </td>
      <td>
        {ownerOnly ? (
          <span className={`role-chip role-${user.role}`}>{ROLE_LABELS[user.role]}</span>
        ) : (
          <select
            className="role-select"
            value={role}
            onChange={(e) => setRole(e.target.value as Exclude<UserRole, 'owner'>)}
          >
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        )}
      </td>
      <td>
        {role === 'club_member' || role === 'admin' ? (
          <input
            className="mini-input"
            placeholder="Position"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          />
        ) : (
          '—'
        )}
      </td>
      <td>
        {role === 'club_member' || role === 'admin' ? (
          <select
            className="role-select"
            value={team}
            onChange={(e) => setTeam(e.target.value as Team | '')}
          >
            <option value="">&mdash;</option>
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
        ) : (
          '—'
        )}
      </td>
      <td>
        {/* Waivers are required of everyone who sets foot on the court,
            outsiders included — not just club members and admins. */}
        <span className="row-actions">
          <span className={waiverCurrent ? 'waiver-chip' : 'waiver-chip no'}>
            {user.waiver_signed_year
              ? waiverCurrent
                ? `Signed ${user.waiver_signed_year}`
                : `Expired ${user.waiver_signed_year}`
              : 'Not signed'}
          </span>
          {!ownerOnly && (
            <button type="button" disabled={waiverSaving} onClick={toggleWaiver}>
              {waiverSaving ? '…' : user.waiver_signed_year ? (waiverCurrent ? 'Unmark' : `Renew`) : 'Mark signed'}
            </button>
          )}
        </span>
      </td>
      <td>
        {role === 'club_member' || role === 'admin' ? (
          <span className="row-actions">
            <span className={duesCurrent ? 'waiver-chip' : 'waiver-chip no'}>
              {user.dues_paid_year
                ? duesCurrent
                  ? `Paid ${user.dues_paid_year}`
                  : `Expired ${user.dues_paid_year}`
                : 'Not paid'}
            </span>
            {!ownerOnly && (
              <button type="button" disabled={duesSaving} onClick={toggleDues}>
                {duesSaving ? '…' : user.dues_paid_year ? (duesCurrent ? 'Unmark' : 'Renew') : 'Mark paid'}
              </button>
            )}
          </span>
        ) : (
          '—'
        )}
      </td>
      <td>
        <span className="row-actions">
          <button type="button" disabled={!dirty || saving} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          {!ownerOnly && user.status !== 'denied' && (
            <button type="button" className="danger" onClick={() => onDecide('denied')}>
              Deny
            </button>
          )}
          {!ownerOnly && user.status === 'denied' && (
            <button type="button" onClick={() => onDecide('approved')}>
              Re-approve
            </button>
          )}
        </span>
      </td>
    </tr>
  )
}

// Non-owner rows in the main table are grouped by role, each group under
// its own header row, so e.g. all club members sit together.
const ROLE_GROUP_ORDER: UserRole[] = ['admin', 'club_member', 'outsider']

function UsersAdmin({ currentUser, onChange }: { currentUser: AuthUser; onChange: () => void }) {
  const isOwner = currentUser.role === 'owner'
  const [users, setUsers] = useState<PendingUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [transferTo, setTransferTo] = useState('')

  function refresh() {
    setLoading(true)
    adminApi.users
      .list()
      .then((res) => setUsers(res.users))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  async function decide(id: number, status: 'approved' | 'denied') {
    try {
      await adminApi.users.decide(id, status)
      refresh()
      onChange()
    } catch (e) {
      setError((e as Error).message)
    }
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
      onChange()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const pending = users.filter((u) => u.status === 'pending')
  const decided = users.filter((u) => u.status !== 'pending')
  const owner = users.find((u) => u.role === 'owner')
  const others = decided.filter((u) => u.role !== 'owner')
  const roleGroups = ROLE_GROUP_ORDER.map((role) => ({
    role,
    members: others.filter((u) => u.role === role),
  })).filter((g) => g.members.length > 0)
  const transferCandidates = users.filter((u) => u.status === 'approved' && u.role !== 'owner')

  return (
    <>
      <div className="admin-main-head">
        <h2>Users</h2>
      </div>
      {error && <p className="admin-error">{error}</p>}
      <p className="admin-note">
        Anyone can create an account by signing in &mdash; new accounts start as outsiders. Promote
        someone to club member or admin below.
        {!isOwner &&
          " Only the owner can grant admin, or change another admin's role, approval status, waiver, or dues — anyone's name, position, and team can still be edited by an admin."}
      </p>
      {loading && <p>Loading&hellip;</p>}

      {!loading && pending.length > 0 && (
        <div className="approvals-panel">
          <div className="ap-head">Pending approvals — {pending.length}</div>
          {pending.map((u) => (
            <div className="ap-row" key={u.id}>
              <div className="ap-info">
                <span className="ap-name">{u.name || u.email}</span>
                <br />
                <span className="ap-email">{u.email}</span>
              </div>
              <span className="provider-chip">{u.provider}</span>
              <div className="ap-actions">
                <button className="approve-btn" type="button" onClick={() => decide(u.id, 'approved')}>
                  Approve
                </button>
                <button className="deny-btn" type="button" onClick={() => decide(u.id, 'denied')}>
                  Deny
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <div className="data-table" style={{ marginTop: '1.5rem' }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Role</th>
                <th>Position</th>
                <th>Team</th>
                <th>Waiver</th>
                <th>Dues</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {owner && (
                <tr>
                  <td>{owner.name || '—'}</td>
                  <td>{owner.email}</td>
                  <td>
                    <span className={`status-chip status-${owner.status}`}>{owner.status}</span>
                  </td>
                  <td>
                    <span className="role-chip role-owner">Owner</span>
                  </td>
                  <td colSpan={4}>
                    <span className="admin-note">Transfer ownership to change</span>
                  </td>
                  <td />
                </tr>
              )}
              {roleGroups.map((g) => (
                <Fragment key={g.role}>
                  <tr className="role-group-header">
                    <td colSpan={8}>{ROLE_LABELS[g.role]}</td>
                  </tr>
                  {g.members.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      isOwner={isOwner}
                      onSaved={refresh}
                      onError={setError}
                      onDecide={(status) => decide(u.id, status)}
                    />
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && isOwner && (
        <div className="admin-form" style={{ marginTop: '1.5rem' }}>
          <span>Transfer ownership to:</span>
          <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
            <option value="">Select an approved user&hellip;</option>
            {transferCandidates.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </select>
          <button className="danger" type="button" disabled={!transferTo} onClick={transferOwnership}>
            Transfer ownership
          </button>
        </div>
      )}
    </>
  )
}

export default UsersAdmin
