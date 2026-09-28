import { Fragment, useEffect, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import AdminModal from '../../components/admin/AdminModal'
import BulkActionBar from '../../components/admin/BulkActionBar'
import { runBulk, summarizeBulk } from '../../lib/bulk'
import { downloadCsv, downloadEmailList, toCsv } from '../../lib/csv'
import { useSelection } from '../../lib/useSelection'
import type { AdminUser, AuthUser, MergePreview, SkillLevel, Team, UserRole } from '../../types'

// Accounts come from signing in, or one at a time from Add account (for
// someone who hasn't signed in yet); there's no bulk CSV import.
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

type Filter = 'everyone' | 'waiver-missing' | 'dues-unpaid' | 'skill-request' | 'duplicates'

// UTC, matching the server's getUTCFullYear() when it stamps the year.
const currentYear = () => new Date().getUTCFullYear()
const paysDues = (role: UserRole) => role === 'club_member' || role === 'admin'

// First and last word of the name, letters only, lowercase: "Abby Hidayat"
// and "abby  hidayat." match; a missing name never does.
function nameKey(u: AdminUser): string | null {
  const words = (u.name ?? '')
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}]/gu, ''))
    .filter(Boolean)
  return words.length >= 2 ? `${words[0]} ${words[words.length - 1]}` : null
}

// Ids of accounts that share their name with another account — likely one
// person with two sign-ins, to be merged. Only accounts the viewer can merge
// count: never the owner's (it can't be edited here), and admins' only for
// the owner (merge.ts).
function duplicateIds(users: AdminUser[], isOwner: boolean): Set<number> {
  const byKey = new Map<string, number[]>()
  for (const u of users) {
    if (u.role === 'owner' || (u.role === 'admin' && !isOwner)) continue
    const key = nameKey(u)
    if (key) byKey.set(key, [...(byKey.get(key) ?? []), u.id])
  }
  return new Set([...byKey.values()].filter((ids) => ids.length > 1).flat())
}

function matchesFilter(u: AdminUser, filter: Filter, duplicates: Set<number>): boolean {
  const year = currentYear()
  switch (filter) {
    case 'duplicates':
      return duplicates.has(u.id)
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
  duplicate,
}: {
  user: AdminUser
  selected: boolean | null
  onToggleSelected: () => void
  editing: boolean
  onEdit: (() => void) | null
  duplicate: boolean
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
        <b>
          {user.name || 'No name'}
          {duplicate && <span className="lock-chip requested user-dup-chip">Possible duplicate</span>}
        </b>
        <span>
          {user.email}
          {user.emails.length > 1 && <span className="user-more-emails"> +{user.emails.length - 1} email{user.emails.length > 2 ? 's' : ''}</span>}
          {user.provider === 'none' && <span className="admin-muted"> &middot; not signed in yet</span>}
        </span>
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
  mergeCandidates,
  onMerge,
}: {
  user: AdminUser
  isOwner: boolean
  onClose: () => void
  onDirtyChange: (dirty: boolean) => void
  // Accounts that may be merged into this one (see merge.ts's rules), and
  // opening the merge review for one of them.
  mergeCandidates: AdminUser[]
  onMerge: (fromId: number) => void
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
  const [newEmail, setNewEmail] = useState('')
  const [mergeFrom, setMergeFrom] = useState('')

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

  // Email changes apply at once (they're not part of Save).
  async function emailAction(fn: () => Promise<unknown>) {
    setSaving(true)
    try {
      await fn()
      onSaved()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }
  // The owner-only lines from emails.ts and merge.ts: an admin's account
  // gains emails or absorbs another account only by the owner's hand.
  const guardedByOwner = !isOwner && user.role === 'admin'

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
          <div className="field user-editor-emails">
            <span>Emails</span>
            <span className="field-hint">
              Signups under any of these count as this person&rsquo;s. Adding one doesn&rsquo;t let anyone sign in with it.
              {user.provider === 'none' &&
                ' Until someone signs in, the account goes to whoever first signs in with the primary email.'}
            </span>
            <ul className="user-email-list">
              {user.emails.map((email) => {
                const primary = email === user.email.toLowerCase()
                return (
                  <li key={email}>
                    <span className="user-email">{email}</span>
                    {primary ? (
                      <span className="waiver-chip">Primary</span>
                    ) : (
                      <span className="user-email-actions">
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          aria-label={`Make ${email} the primary email`}
                          disabled={saving}
                          onClick={() => emailAction(() => adminApi.users.update(user.id, { primary_email: email }))}
                        >
                          Make primary
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm danger"
                          aria-label={`Remove ${email}`}
                          disabled={saving}
                          onClick={() => {
                            if (!confirm(`Remove ${email}? Signups under it stop counting as ${user.name || 'this person'}'s.`)) return
                            emailAction(() => adminApi.users.removeEmail(user.id, email))
                          }}
                        >
                          Remove
                        </button>
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
            {!guardedByOwner && (
              <form
                className="user-editor-inline"
                onSubmit={(e) => {
                  e.preventDefault()
                  const email = newEmail.trim()
                  if (!email) return
                  emailAction(async () => {
                    await adminApi.users.addEmail(user.id, email)
                    setNewEmail('')
                  })
                }}
              >
                <input
                  type="email"
                  aria-label="Add another email"
                  placeholder="Add another email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
                <button type="submit" className="btn btn-outline btn-sm" disabled={saving || !newEmail.trim()}>
                  Add
                </button>
              </form>
            )}
          </div>
          {!guardedByOwner && mergeCandidates.length > 0 && (
            <div className="field user-editor-emails">
              <span>Merge another account into this one</span>
              <span className="field-hint">
                For a duplicate of this person. Its emails, sign-ins, signups, teams and kudos move here, then it&rsquo;s
                removed.
              </span>
              <span className="user-editor-inline">
                <select aria-label="Account to merge in" value={mergeFrom} onChange={(e) => setMergeFrom(e.target.value)}>
                  <option value="">Pick an account&hellip;</option>
                  {mergeCandidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || 'No name'} ({c.email})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={!mergeFrom || saving || dirty}
                  title={dirty ? 'Save or cancel your changes first' : undefined}
                  onClick={() => onMerge(Number(mergeFrom))}
                >
                  Review merge
                </button>
              </span>
            </div>
          )}
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

type UpdateBody = Parameters<typeof adminApi.users.update>[1]

// One entry per choice in the bulk "Set" menu. `done` marks rows already in
// that state (left alone, so e.g. a waiver's signed date isn't restamped);
// `skip` gives the reason a row can't take the change at all.
interface BulkAction {
  label: string
  body: UpdateBody
  done: (u: AdminUser) => boolean
  skip?: (u: AdminUser) => string | null
  // Clearing a waiver or dues drops its recorded date, so it asks first.
  confirm?: boolean
}

function bulkActions(isOwner: boolean): { group: string; actions: Record<string, BulkAction> }[] {
  const year = currentYear()
  const roleSkip = (u: AdminUser) =>
    !isOwner && u.role === 'admin' ? "only the owner can change an admin's role" : null
  const role = (r: Exclude<UserRole, 'owner'>): BulkAction => ({
    label: `Role: ${ROLE_LABELS[r]}`,
    body: { role: r },
    done: (u) => u.role === r,
    skip: roleSkip,
  })
  const duesSkip = (u: AdminUser) => (paysDues(u.role) ? null : "outsiders don't pay dues")
  return [
    {
      group: 'Role',
      actions: {
        'role:outsider': role('outsider'),
        'role:club_member': role('club_member'),
        ...(isOwner ? { 'role:admin': role('admin') } : {}),
      },
    },
    {
      group: 'Paperwork',
      actions: {
        'waiver:on': {
          label: `Waiver signed (${year})`,
          body: { waiver_signed: true },
          done: (u) => u.waiver_signed_year === year,
        },
        'waiver:off': {
          label: 'Waiver not signed',
          body: { waiver_signed: false },
          done: (u) => u.waiver_signed_year !== year,
          confirm: true,
        },
        'dues:on': {
          label: `Dues paid (${year})`,
          body: { dues_paid: true },
          done: (u) => u.dues_paid_year === year,
          skip: duesSkip,
        },
        'dues:off': {
          label: 'Dues not paid',
          body: { dues_paid: false },
          done: (u) => u.dues_paid_year !== year,
          skip: duesSkip,
          confirm: true,
        },
      },
    },
    {
      group: 'RSVPs',
      actions: {
        'rsvp:on': {
          label: 'Approve each RSVP by hand',
          body: { rsvp_restricted: true },
          done: (u) => u.rsvp_restricted,
        },
        'rsvp:off': {
          label: 'Stop approving RSVPs by hand',
          body: { rsvp_restricted: false },
          done: (u) => !u.rsvp_restricted,
        },
      },
    },
    {
      group: 'Skill level',
      actions: {
        'lock:on': {
          label: 'Lock skill level',
          body: { skill_level_locked: true },
          done: (u) => u.skill_level_locked,
        },
        'lock:off': {
          label: 'Unlock skill level',
          body: { skill_level_locked: false },
          done: (u) => !u.skill_level_locked,
        },
      },
    },
  ]
}

// Rows are ordered by role, admins first, so e.g. all club members sit
// together.
const ROLE_ORDER: UserRole[] = ['admin', 'club_member', 'outsider']

// For someone who hasn't signed in yet (e.g. from a paper waiver list): the
// account becomes theirs when they first sign in with this email through a
// provider that vouches for it (PSU Microsoft, or verified Google).
function AddAccountModal({
  isOwner,
  onClose,
  onCreated,
}: {
  isOwner: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Exclude<UserRole, 'owner'>>('outsider')
  const [waiver, setWaiver] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = name.trim() !== '' || email.trim() !== ''

  function close() {
    if (saving) return
    if (dirty && !confirm('Discard this new account?')) return
    onClose()
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await adminApi.users.create({ name: name.trim(), email: email.trim(), role, waiver_signed: waiver })
      onCreated()
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminModal title="Add account" onClose={close}>
      <form className="event-form add-account-form" onSubmit={submit}>
        <p className="field-hint">
          For someone who hasn&rsquo;t signed in yet. When they sign in with this email (PSU Microsoft, or a verified
          Google account), the account becomes theirs.
        </p>
        <label className="field">
          Name
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Email
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          Role
          <select value={role} onChange={(e) => setRole(e.target.value as Exclude<UserRole, 'owner'>)}>
            <option value="outsider">Outsider</option>
            <option value="club_member">Club member</option>
            {isOwner && <option value="admin">Admin</option>}
          </select>
        </label>
        <label className="switch-row">
          <input type="checkbox" checked={waiver} onChange={(e) => setWaiver(e.target.checked)} />
          Waiver signed ({currentYear()})
        </label>
        {error && <p className="admin-error">{error}</p>}
        <div className="form-actions">
          <button className="btn btn-outline" type="button" disabled={saving} onClick={close}>
            Cancel
          </button>
          <button className="btn btn-ace" type="submit" disabled={saving}>
            {saving ? 'Adding…' : 'Add account'}
          </button>
        </div>
      </form>
    </AdminModal>
  )
}

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  microsoft: 'PSU Microsoft',
  'microsoft-other': 'personal Microsoft',
}
function providerLabel(provider: string): string {
  const label = PROVIDER_LABELS[provider]
  if (!label) throw new Error(`Unknown sign-in provider ${provider}`)
  return label
}

// Shows what merging `fromId` into `intoId` does before it happens — the
// counts come from the server (GET .../merge), the kept-value rules mirror
// merge.ts.
function MergeReviewModal({
  intoId,
  fromId,
  onClose,
  onMerged,
}: {
  intoId: number
  fromId: number
  onClose: () => void
  onMerged: () => void
}) {
  const [preview, setPreview] = useState<MergePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [merging, setMerging] = useState(false)

  useEffect(() => {
    adminApi.users
      .mergePreview(intoId, fromId)
      .then(setPreview)
      .catch((e: Error) => setError(e.message))
  }, [intoId, fromId])

  async function confirmMerge() {
    setMerging(true)
    setError(null)
    try {
      await adminApi.users.merge(intoId, fromId)
      onMerged()
    } catch (e) {
      setError((e as Error).message)
      setMerging(false)
    }
  }

  const label = (u: MergePreview['into']) => u.name || 'No name'
  const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

  return (
    <AdminModal title={preview ? `Merge into ${label(preview.into)}?` : 'Merge accounts'} onClose={() => !merging && onClose()}>
      {!preview && !error && <p className="admin-loading">Loading&hellip;</p>}
      {error && <p className="admin-error">{error}</p>}
      {preview && (
        <div className="merge-review">
          <div className="merge-pair">
            <div className="merge-card">
              <span className="merge-card-label">Removed</span>
              <b>{label(preview.from)}</b>
              <span>{preview.from.email}</span>
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
            <div className="merge-card kept">
              <span className="merge-card-label">Kept</span>
              <b>{label(preview.into)}</b>
              <span>{preview.into.email}</span>
            </div>
          </div>
          <h5>Moves to the kept account</h5>
          <ul>
            <li>
              {count(preview.moves.emails.length, 'email')}
              {preview.moves.emails.length > 0 && `: ${preview.moves.emails.join(', ')}`}
            </li>
            <li>
              {preview.moves.logins.length > 0
                ? `Sign-in with ${preview.moves.logins.map(providerLabel).join(' and ')}`
                : 'No sign-ins (never signed in)'}
            </li>
            <li>
              {count(preview.moves.signups, 'signup')}, {count(preview.moves.team_spots, 'team spot')},{' '}
              {count(preview.moves.kudos, 'kudos', 'kudos')}, {count(preview.moves.roster_rows, 'roster row')}
            </li>
          </ul>
          <h5>The kept account after the merge</h5>
          <ul>
            <li>Its name, position, team and primary email stay; blanks are filled from the other account.</li>
            <li>The later waiver and dues year, and the higher role, win.</li>
            <li>Duplicates of what it already has (a roster row that season, a team spot that event) are dropped.</li>
          </ul>
          <p className="merge-warning">This can&rsquo;t be undone. The other account is deleted.</p>
          <div className="form-actions">
            <button className="btn btn-outline" type="button" disabled={merging} onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-ace" type="button" disabled={merging} onClick={confirmMerge}>
              {merging ? 'Merging…' : 'Merge accounts'}
            </button>
          </div>
        </div>
      )}
    </AdminModal>
  )
}

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
  const [adding, setAdding] = useState(false)
  const [merging, setMerging] = useState<{ intoId: number; fromId: number } | null>(null)
  useEffect(() => {
    onDirtyChange(editorDirty)
    return () => onDirtyChange(false)
  }, [editorDirty, onDirtyChange])
  const selection = useSelection()
  const [bulkKey, setBulkKey] = useState('waiver:on')
  const [bulkBusy, setBulkBusy] = useState(false)
  // What the last bulk run did (updated / already set / skipped). Failures
  // go to `error` instead.
  const [bulkNote, setBulkNote] = useState<string | null>(null)
  const bulkGroups = bulkActions(isOwner)
  const bulkAction = bulkGroups.map((g) => g.actions[bulkKey]).find(Boolean)

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
  // hide the rest). Rows that can't take the change (a non-owner re-roling an
  // admin, dues on an outsider) are skipped up front instead of each failing
  // server-side, and rows already in that state are left alone.
  async function applyBulk() {
    if (!bulkAction) throw new Error(`Unknown bulk action ${bulkKey}`)
    const skipped = new Map<string, number>()
    let already = 0
    const targets: AdminUser[] = []
    for (const u of selectedVisible) {
      const reason = bulkAction.skip?.(u) ?? null
      if (reason) skipped.set(reason, (skipped.get(reason) ?? 0) + 1)
      else if (bulkAction.done(u)) already++
      else targets.push(u)
    }
    if (
      bulkAction.confirm &&
      targets.length > 0 &&
      !confirm(`${bulkAction.label} for ${targets.length} user${targets.length === 1 ? '' : 's'}? This clears their recorded date.`)
    )
      return
    setBulkBusy(true)
    setBulkNote(null)
    const result = await runBulk(targets, (u) => adminApi.users.update(u.id, bulkAction.body))
    // Failures go to the error banner; the note only reports what worked,
    // so a run where everything failed shows no success note.
    const parts = [`${bulkAction.label}. Updated ${result.ok}.`]
    if (already > 0) parts.push(`${already} already set.`)
    for (const [reason, n] of skipped) parts.push(`Skipped ${n} (${reason}).`)
    setBulkNote(result.ok === 0 && result.failed > 0 ? null : parts.join(' '))
    setError(summarizeBulk(result, bulkAction.label))
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
    !query || (u.name ?? '').toLowerCase().includes(query) || u.emails.some((e) => e.includes(query))
  const duplicates = duplicateIds(users, isOwner)
  // The row being edited stays listed even if a search, a filter, or its own
  // Approve/Dismiss stops it matching, so the editor never vanishes mid-edit.
  const others = users
    .filter((u) => u.role !== 'owner')
    .filter((u) => u.id === editingId || (matchesQuery(u) && matchesFilter(u, filter, duplicates)))
    .sort(
      (a, b) =>
        ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) ||
        (a.name ?? a.email).localeCompare(b.name ?? b.email),
    )
  const showOwner = owner !== undefined && matchesQuery(owner) && matchesFilter(owner, filter, duplicates)
  // Who can be merged into `into`: not itself, the owner, or yourself, and
  // an admin only by the owner (merge.ts). Same-name accounts first.
  const mergeCandidates = (into: AdminUser) =>
    users
      .filter(
        (u) =>
          u.id !== into.id &&
          u.role !== 'owner' &&
          u.email !== currentUser.email &&
          (isOwner || u.role !== 'admin')
      )
      .sort(
        (a, b) =>
          Number(nameKey(b) === nameKey(into)) - Number(nameKey(a) === nameKey(into)) ||
          (a.name ?? a.email).localeCompare(b.name ?? b.email)
      )
  const transferCandidates = users.filter((u) => u.role !== 'owner')
  const selectedVisible = others.filter((u) => selection.isSelected(u.id))

  // The last bulk run's note describes that run only, so it goes as soon
  // as the admin starts something else.
  useEffect(() => {
    if (selectedVisible.length > 0 || editingId !== null) setBulkNote(null)
  }, [selectedVisible.length, editingId])

  const filters: { key: Filter; label: string }[] = [
    { key: 'everyone', label: 'Everyone' },
    { key: 'waiver-missing', label: 'Waiver missing' },
    { key: 'dues-unpaid', label: 'Dues unpaid' },
    { key: 'skill-request', label: 'Skill request' },
    { key: 'duplicates', label: 'Possible duplicates' },
  ]

  return (
    <>
      <div className="admin-main-head">
        <div>
          <h2>Users</h2>
          <p className="admin-page-desc">
            Everyone with an account. Add people before they sign in; their first sign-in with that email claims the
            account. New sign-ups start as outsiders.
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
          <button className="add-btn" type="button" onClick={() => setAdding(true)}>
            Add account
          </button>
        </span>
      </div>
      {error && <p className="admin-error">{error}</p>}
      {bulkNote && (
        <p className="admin-bulk-note" role="status">
          {bulkNote}
        </p>
      )}
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
                  <span className="admin-segmented-count">
                    {users.filter((u) => matchesFilter(u, f.key, duplicates)).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {filter === 'duplicates' && (
        <p className="field-hint">
          Accounts that share a name with another. Open one and use <b>Review merge</b> if they&rsquo;re the same person.
        </p>
      )}

      <BulkActionBar count={selectedVisible.length} onClear={selection.clear}>
        <label className="bulk-set">
          Set
          <select value={bulkKey} onChange={(e) => setBulkKey(e.target.value)}>
            {bulkGroups.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {Object.entries(g.actions).map(([key, a]) => (
                  <option key={key} value={key}>
                    {a.label.replace(/^Role: /, '')}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button type="button" className="bulk-apply" disabled={bulkBusy} onClick={applyBulk}>
          {bulkBusy ? 'Applying…' : `Apply to ${selectedVisible.length}`}
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
                <UserSummaryRow
                  user={owner}
                  selected={null}
                  onToggleSelected={() => {}}
                  editing={false}
                  onEdit={null}
                  duplicate={duplicates.has(owner.id)}
                />
              )}
              {others.map((u) => (
                <Fragment key={u.id}>
                  <UserSummaryRow
                    user={u}
                    selected={selection.isSelected(u.id)}
                    onToggleSelected={() => selection.toggle(u.id)}
                    editing={editingId === u.id}
                    onEdit={() => toggleEditor(u.id)}
                    duplicate={duplicates.has(u.id)}
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
                      mergeCandidates={mergeCandidates(u)}
                      onMerge={(fromId) => setMerging({ intoId: u.id, fromId })}
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

      {adding && <AddAccountModal isOwner={isOwner} onClose={() => setAdding(false)} onCreated={refresh} />}
      {merging && (
        <MergeReviewModal
          intoId={merging.intoId}
          fromId={merging.fromId}
          onClose={() => setMerging(null)}
          onMerged={() => {
            setMerging(null)
            // The editor's fields are from before the merge; reopen fresh.
            setEditingId(null)
            if (selection.isSelected(merging.fromId)) selection.toggle(merging.fromId)
            refresh()
          }}
        />
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
