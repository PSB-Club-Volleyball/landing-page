import { Fragment, useEffect, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import BulkActionBar from '../../components/admin/BulkActionBar'
import { runBulk, summarizeBulk } from '../../lib/bulk'
import { downloadCsv, downloadEmailList, toCsv } from '../../lib/csv'
import { useSelection } from '../../lib/useSelection'
import type { AdminUser, AuthUser, Team, UserRole } from '../../types'

// No CSV import here: accounts are created by signing in (OAuth), not by an
// admin typing rows into a spreadsheet, so there's no legitimate "create a
// user from a CSV" action to offer.
function exportUsersCsv(users: AdminUser[]) {
  const csv = toCsv(
    ['Name', 'Email', 'Role', 'Position', 'Team', 'Waiver signed year', 'Dues paid year', 'RSVP restricted'],
    users.map((u) => [
      u.name,
      u.email,
      u.role,
      u.position,
      u.team,
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

function UserRow({
  user,
  isOwner,
  selected,
  onToggleSelected,
  onSaved,
  onError,
  onRemove,
}: {
  user: AdminUser
  isOwner: boolean
  selected: boolean
  onToggleSelected: () => void
  onSaved: () => void
  onError: (msg: string) => void
  onRemove: () => void
}) {
  const [role, setRole] = useState<Exclude<UserRole, 'owner'>>(user.role === 'owner' ? 'admin' : user.role)
  const [name, setName] = useState(user.name ?? '')
  const [position, setPosition] = useState(user.position ?? '')
  const [team, setTeam] = useState<Team | ''>(user.team ?? '')
  const [saving, setSaving] = useState(false)
  const [waiverSaving, setWaiverSaving] = useState(false)
  const [duesSaving, setDuesSaving] = useState(false)
  const [restrictSaving, setRestrictSaving] = useState(false)

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

  async function toggleRestricted() {
    setRestrictSaving(true)
    try {
      await adminApi.users.update(user.id, { rsvp_restricted: !user.rsvp_restricted })
      onSaved()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setRestrictSaving(false)
    }
  }

  // Only the owner may re-role a row that's currently admin — even the
  // admin's own row. Waiver/dues verification and basic profile fields
  // (name/position/team) are never guarded — any admin can mark another
  // admin's waiver/dues and edit their basic info, including their own.
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
      <td className="select-col">
        <input type="checkbox" checked={selected} onChange={onToggleSelected} />
      </td>
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
          <button type="button" disabled={waiverSaving} onClick={toggleWaiver}>
            {waiverSaving ? '…' : user.waiver_signed_year ? (waiverCurrent ? 'Unmark' : `Renew`) : 'Mark signed'}
          </button>
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
            <button type="button" disabled={duesSaving} onClick={toggleDues}>
              {duesSaving ? '…' : user.dues_paid_year ? (duesCurrent ? 'Unmark' : 'Renew') : 'Mark paid'}
            </button>
          </span>
        ) : (
          '—'
        )}
      </td>
      <td>
        <span className="row-actions">
          <span className={user.rsvp_restricted ? 'waiver-chip no' : 'waiver-chip'}>
            {user.rsvp_restricted ? 'Restricted' : 'Unrestricted'}
          </span>
          <button type="button" disabled={restrictSaving} onClick={toggleRestricted}>
            {restrictSaving ? '…' : user.rsvp_restricted ? 'Unrestrict' : 'Restrict'}
          </button>
        </span>
      </td>
      <td>
        <span className="row-actions">
          <button type="button" disabled={!dirty || saving} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          {!ownerOnly && (
            <button type="button" className="danger" onClick={onRemove}>
              Delete
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

function UsersAdmin({ currentUser }: { currentUser: AuthUser }) {
  const isOwner = currentUser.role === 'owner'
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [transferTo, setTransferTo] = useState('')
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
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function runSelectedBulk(verb: string, fn: (id: number) => Promise<unknown>) {
    setBulkBusy(true)
    const result = await runBulk([...selection.selected], fn)
    setError(summarizeBulk(result, verb))
    selection.clear()
    refresh()
    setBulkBusy(false)
  }

  const applyBulkRole = () => runSelectedBulk('Bulk role change', (id) => adminApi.users.update(id, { role: bulkRole }))

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

  const owner = users.find((u) => u.role === 'owner')
  const others = users.filter((u) => u.role !== 'owner')
  const roleGroups = ROLE_GROUP_ORDER.map((role) => ({
    role,
    members: others.filter((u) => u.role === role),
  })).filter((g) => g.members.length > 0)
  const transferCandidates = others

  return (
    <>
      <div className="admin-main-head">
        <h2>Users</h2>
        <span className="admin-head-actions">
          <button className="btn btn-outline btn-sm" type="button" onClick={() => exportUsersCsv(users)}>
            Download CSV
          </button>
          <button
            className="btn btn-outline btn-sm"
            type="button"
            disabled={!users.some((u) => u.email)}
            onClick={() => downloadEmailList('users-emails.txt', users.map((u) => u.email))}
          >
            Emails only
          </button>
        </span>
      </div>
      {error && <p className="admin-error">{error}</p>}
      <p className="admin-note">
        Anyone can create an account by signing in &mdash; new accounts start as outsiders. Promote
        someone to club member or admin below.
        {!isOwner &&
          " Only the owner can grant admin or change another admin's role — anyone's name, position, team, waiver, and dues can still be edited by an admin."}
      </p>
      {loading && <p>Loading&hellip;</p>}

      <BulkActionBar count={selection.selected.size} onClear={selection.clear}>
        <select value={bulkRole} onChange={(e) => setBulkRole(e.target.value as Exclude<UserRole, 'owner'>)}>
          <option value="outsider">Outsider</option>
          <option value="club_member">Club member</option>
          {isOwner && <option value="admin">Admin</option>}
        </select>
        <button type="button" disabled={bulkBusy} onClick={applyBulkRole}>
          Set role
        </button>
      </BulkActionBar>

      {!loading && (
        <div className="data-table" style={{ marginTop: '1.5rem' }}>
          <table>
            <thead>
              <tr>
                <th className="select-col">
                  <input
                    type="checkbox"
                    checked={others.length > 0 && others.every((u) => selection.isSelected(u.id))}
                    onChange={() => selection.toggleAll(others.map((u) => u.id))}
                  />
                </th>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Position</th>
                <th>Team</th>
                <th>Waiver</th>
                <th>Dues</th>
                <th>RSVP</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {owner && (
                <tr>
                  <td />
                  <td>{owner.name || '—'}</td>
                  <td>{owner.email}</td>
                  <td>
                    <span className="role-chip role-owner">Owner</span>
                  </td>
                  <td colSpan={5}>
                    <span className="admin-note">Transfer ownership to change</span>
                  </td>
                  <td />
                </tr>
              )}
              {roleGroups.map((g) => (
                <Fragment key={g.role}>
                  <tr className="role-group-header">
                    <td colSpan={10}>{ROLE_LABELS[g.role]}</td>
                  </tr>
                  {g.members.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      isOwner={isOwner}
                      selected={selection.isSelected(u.id)}
                      onToggleSelected={() => selection.toggle(u.id)}
                      onSaved={refresh}
                      onError={setError}
                      onRemove={() => remove(u.id, u.name || u.email)}
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
            <option value="">Select a user&hellip;</option>
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
