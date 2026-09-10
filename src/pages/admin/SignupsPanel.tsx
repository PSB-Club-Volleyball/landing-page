import { useEffect, useMemo, useRef, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import { downloadCsv, downloadEmailList, toCsv } from '../../lib/csv'
import type { EventSignup, SignupStatus } from '../../types'

function eventSlug(eventTitle: string) {
  return eventTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'event'
}

function answersText(s: EventSignup, sep: string) {
  return s.answers ? Object.values(s.answers).filter(Boolean).join(sep) : ''
}

function exportFullCsv(eventTitle: string, signups: EventSignup[]) {
  const csv = toCsv(
    ['Name', 'Email', 'Answers', 'Status', 'Checked in', 'Submitted'],
    signups.map((s) => [
      s.name,
      s.email,
      answersText(s, '; '),
      s.status,
      s.checked_in_at ? new Date(s.checked_in_at).toLocaleString() : '',
      new Date(s.created_at).toLocaleString(),
    ])
  )
  downloadCsv(`${eventSlug(eventTitle)}-signups.csv`, csv)
}

// Approved-only, name-sorted, with a blank "Checked in" column to tick off on
// paper at the door.
function exportCheckinList(eventTitle: string, signups: EventSignup[]) {
  const approved = signups
    .filter((s) => s.status === 'approved')
    .sort((a, b) => a.name.localeCompare(b.name))
  const csv = toCsv(
    ['Name', 'Email', 'Checked in'],
    approved.map((s) => [s.name, s.email, s.checked_in_at ? 'yes' : ''])
  )
  downloadCsv(`${eventSlug(eventTitle)}-checkin.csv`, csv)
}

const STATUS_FILTERS: { key: SignupStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'waitlist', label: 'Waitlist' },
  { key: 'denied', label: 'Denied' },
]

type SortKey = 'name' | 'status' | 'created'
const STATUS_RANK: Record<SignupStatus, number> = { pending: 0, waitlist: 1, approved: 2, denied: 3 }

// The attendee roster for one event: approve / deny / waitlist / promote /
// check-in / remove, plus filtering, search, bulk actions, CSV export,
// "release pending", check-in mode, and an email announcement composer.
// Rendered on the admin event page's Signups tab.
export default function SignupsPanel({
  eventId,
  eventTitle,
  capacity,
  onChanged,
}: {
  eventId: number
  eventTitle: string
  capacity?: number | null
  onChanged: () => void
}) {
  const [signups, setSignups] = useState<EventSignup[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [releasing, setReleasing] = useState(false)
  const [announceOpen, setAnnounceOpen] = useState(false)
  const [announceSubject, setAnnounceSubject] = useState('')
  const [announceMessage, setAnnounceMessage] = useState('')
  const [announcing, setAnnouncing] = useState(false)
  const [announceNote, setAnnounceNote] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<SignupStatus | 'all'>('all')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'created', dir: 'asc' })
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [checkinMode, setCheckinMode] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  function refresh() {
    adminApi.events
      .signups(eventId)
      .then((res) => setSignups(res.signups))
      .catch((e: Error) => setError(e.message))
  }

  useEffect(refresh, [eventId])

  // Close the export menu on an outside click.
  useEffect(() => {
    if (!exportOpen) return
    function onDown(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [exportOpen])

  async function handleRemove(signupId: number) {
    if (!confirm('Remove this person from the signup list?')) return
    try {
      await adminApi.events.removeSignup(eventId, signupId)
      refresh()
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleDecide(signupId: number, status: 'approved' | 'denied' | 'waitlist') {
    try {
      await adminApi.events.decideSignup(eventId, signupId, status)
      refresh()
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleToggleCheckedIn(signupId: number, checkedIn: boolean) {
    try {
      await adminApi.events.setCheckedIn(eventId, signupId, checkedIn)
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function runBulk(action: 'approved' | 'waitlist' | 'denied' | 'remove') {
    const ids = [...selected]
    if (ids.length === 0) return
    const verb = action === 'remove' ? 'Remove' : action === 'approved' ? 'Approve' : action === 'waitlist' ? 'Waitlist' : 'Deny'
    if (!confirm(`${verb} ${ids.length} selected ${ids.length === 1 ? 'person' : 'people'}?`)) return
    setBulkBusy(true)
    setError(null)
    try {
      for (const id of ids) {
        if (action === 'remove') await adminApi.events.removeSignup(eventId, id)
        else await adminApi.events.decideSignup(eventId, id, action)
      }
      setSelected(new Set())
      refresh()
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBulkBusy(false)
    }
  }

  async function handleRelease() {
    if (!confirm(`Release all pending requests for ${eventTitle}? Anyone who fits will be approved; the rest go to the waitlist.`)) return
    setReleasing(true)
    try {
      const res = await adminApi.events.release(eventId)
      setAnnounceNote(`Released: ${res.approved} approved, ${res.waitlisted} waitlisted.`)
      refresh()
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setReleasing(false)
    }
  }

  async function handleAnnounce(ev: React.FormEvent) {
    ev.preventDefault()
    setAnnouncing(true)
    setAnnounceNote(null)
    try {
      const res = await adminApi.events.announce(eventId, { subject: announceSubject, message: announceMessage })
      setAnnounceNote(`Emailed ${res.recipient_count} ${res.recipient_count === 1 ? 'person' : 'people'}.`)
      setAnnounceSubject('')
      setAnnounceMessage('')
      setAnnounceOpen(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setAnnouncing(false)
    }
  }

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, waitlist: 0, denied: 0, checkedIn: 0 }
    for (const s of signups ?? []) {
      c[s.status]++
      if (s.checked_in_at) c.checkedIn++
    }
    return c
  }, [signups])

  // Waitlist position, oldest request = #1.
  const waitlistPos = useMemo(() => {
    const pos = new Map<number, number>()
    ;(signups ?? [])
      .filter((s) => s.status === 'waitlist')
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .forEach((s, i) => pos.set(s.id, i + 1))
    return pos
  }, [signups])

  const visible = useMemo(() => {
    let list = signups ?? []
    if (checkinMode) list = list.filter((s) => s.status === 'approved')
    else if (statusFilter !== 'all') list = list.filter((s) => s.status === statusFilter)
    const q = query.trim().toLowerCase()
    if (q) list = list.filter((s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      if (sort.key === 'name') return a.name.localeCompare(b.name) * dir
      if (sort.key === 'status') return (STATUS_RANK[a.status] - STATUS_RANK[b.status]) * dir
      return a.created_at.localeCompare(b.created_at) * dir
    })
  }, [signups, checkinMode, statusFilter, query, sort])

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }
  function sortArrow(key: SortKey) {
    if (sort.key !== key) return null
    return <span className="sort-arrow">{sort.dir === 'asc' ? ' ↑' : ' ↓'}</span>
  }

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const allVisibleSelected = visible.length > 0 && visible.every((s) => selected.has(s.id))
  function toggleSelectAll() {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev)
        visible.forEach((s) => next.delete(s.id))
        return next
      }
      return new Set([...prev, ...visible.map((s) => s.id)])
    })
  }

  if (error && !signups) return <p className="admin-error">{error}</p>
  if (!signups) return <p className="admin-note">Loading&hellip;</p>

  const capacityKnown = typeof capacity === 'number' && capacity > 0
  const capPct = capacityKnown ? Math.min(100, Math.round((counts.approved / (capacity as number)) * 100)) : 0
  const checkinPct = counts.approved > 0 ? Math.round((counts.checkedIn / counts.approved) * 100) : 0

  return (
    <div className="signups-panel">
      {!checkinMode && (
        <div className="signups-stats">
          <div className="signups-stat"><b>{counts.approved}</b><span>Approved</span></div>
          <div className="signups-stat warn"><b>{counts.pending}</b><span>Pending</span></div>
          <div className="signups-stat"><b>{counts.waitlist}</b><span>Waitlist</span></div>
          <div className="signups-stat"><b>{counts.checkedIn}</b><span>Checked in</span></div>
        </div>
      )}
      {!checkinMode && capacityKnown && (
        <div className="signups-capacity">
          <div className="signups-capacity-row">
            <span>Capacity</span>
            <span>{counts.approved} / {capacity}</span>
          </div>
          <div className="admin-meter"><i style={{ width: `${capPct}%` }} /></div>
        </div>
      )}

      {checkinMode && (
        <div className="checkin-banner">
          <b>{counts.checkedIn} / {counts.approved}</b> checked in
          <div className="admin-meter good"><i style={{ width: `${checkinPct}%` }} /></div>
        </div>
      )}

      <div className="signups-toolbar">
        <input
          className="signups-search"
          type="search"
          placeholder="Search name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {!checkinMode && (
          <div className="signups-filter-chips">
            {STATUS_FILTERS.map((f) => {
              const n = f.key === 'all' ? signups.length : counts[f.key]
              return (
                <button
                  key={f.key}
                  type="button"
                  className={statusFilter === f.key ? 'chip on' : 'chip'}
                  onClick={() => setStatusFilter(f.key)}
                >
                  {f.label} {n}
                </button>
              )
            })}
          </div>
        )}
        <span className="signups-toolbar-spacer" />
        <button
          type="button"
          className={checkinMode ? 'btn btn-ace btn-sm' : 'btn btn-outline btn-sm'}
          onClick={() => {
            setCheckinMode((v) => !v)
            setSelected(new Set())
          }}
        >
          {checkinMode ? 'Exit check-in mode' : 'Check-in mode'}
        </button>
        {!checkinMode && (
          <>
            <div className="signups-export" ref={exportRef}>
              <button
                type="button"
                className="btn btn-outline btn-sm signups-export-btn"
                disabled={signups.length === 0}
                onClick={() => setExportOpen((v) => !v)}
              >
                Export
              </button>
              {exportOpen && (
                <div className="signups-export-menu">
                  <button type="button" onClick={() => { exportFullCsv(eventTitle, signups); setExportOpen(false) }}>
                    Full CSV<small>Name, email, answers, status, check-in</small>
                  </button>
                  <button type="button" onClick={() => { downloadEmailList(`${eventSlug(eventTitle)}-emails.csv`, signups.map((s) => s.email)); setExportOpen(false) }}>
                    Emails only<small>Comma-separated, for a mail merge</small>
                  </button>
                  <button type="button" onClick={() => { exportCheckinList(eventTitle, signups); setExportOpen(false) }}>
                    Check-in list<small>Approved only, name-sorted, tick column</small>
                  </button>
                </div>
              )}
            </div>
            <button className="btn btn-outline btn-sm" type="button" disabled={counts.pending === 0 || releasing} onClick={handleRelease}>
              {releasing ? 'Releasing…' : `Release ${counts.pending} pending`}
            </button>
            <button
              className="btn btn-outline btn-sm"
              type="button"
              disabled={signups.length === 0}
              onClick={() => setAnnounceOpen((v) => !v)}
            >
              Email attendees
            </button>
          </>
        )}
      </div>

      {error && <p className="admin-error">{error}</p>}
      {announceNote && <p className="admin-note">{announceNote}</p>}
      {announceOpen && !checkinMode && (
        <form className="announce-form" onSubmit={handleAnnounce}>
          <label className="field">
            Subject
            <input required value={announceSubject} onChange={(e) => setAnnounceSubject(e.target.value)} />
          </label>
          <label className="field">
            Message
            <textarea required rows={4} value={announceMessage} onChange={(e) => setAnnounceMessage(e.target.value)} />
          </label>
          <p className="field-hint">Emails everyone signed up for this event (approved, waitlisted, and pending).</p>
          <div className="form-actions">
            <button className="btn btn-outline" type="button" onClick={() => setAnnounceOpen(false)}>Cancel</button>
            <button className="btn btn-ace" type="submit" disabled={announcing}>{announcing ? 'Sending…' : 'Send'}</button>
          </div>
        </form>
      )}

      {!checkinMode && selected.size > 0 && (
        <div className="bulk-action-bar">
          <span className="bulk-count">{selected.size} selected</span>
          <div className="bulk-actions">
            <button className="btn btn-ace btn-sm" type="button" disabled={bulkBusy} onClick={() => runBulk('approved')}>Approve</button>
            <button className="btn btn-outline btn-sm" type="button" disabled={bulkBusy} onClick={() => runBulk('waitlist')}>Waitlist</button>
            <button className="btn btn-outline btn-sm" type="button" disabled={bulkBusy} onClick={() => runBulk('denied')}>Deny</button>
            <button className="btn btn-outline btn-sm danger" type="button" disabled={bulkBusy} onClick={() => runBulk('remove')}>Remove</button>
            <button className="link-btn" type="button" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        </div>
      )}

      {signups.length === 0 ? (
        <p className="admin-note">No one has signed up yet.</p>
      ) : visible.length === 0 ? (
        <p className="admin-note">No signups match this filter.</p>
      ) : checkinMode ? (
        <ul className="checkin-list">
          {visible.map((s) => (
            <li key={s.id}>
              <span className="checkin-who">
                <b>{s.name}</b>
                {answersText(s, ', ') && <span>{answersText(s, ', ')}</span>}
              </span>
              <button
                type="button"
                className={s.checked_in_at ? 'btn btn-outline btn-sm checkin-done' : 'btn btn-ace btn-sm'}
                onClick={() => handleToggleCheckedIn(s.id, !s.checked_in_at)}
              >
                {s.checked_in_at ? `✓ In · ${new Date(s.checked_in_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Check in'}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <table className="signups-table">
          <thead>
            <tr>
              <th className="select-col">
                <input type="checkbox" aria-label="Select all" checked={allVisibleSelected} onChange={toggleSelectAll} />
              </th>
              <th><button type="button" className="th-sort" onClick={() => toggleSort('name')}>Name{sortArrow('name')}</button></th>
              <th><button type="button" className="th-sort" onClick={() => toggleSort('status')}>Status{sortArrow('status')}</button></th>
              <th>Answers</th>
              <th>Checked in</th>
              <th><button type="button" className="th-sort" onClick={() => toggleSort('created')}>Submitted{sortArrow('created')}</button></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => (
              <tr key={s.id} className={selected.has(s.id) ? 'row-selected' : undefined}>
                <td className="select-col">
                  <input type="checkbox" aria-label={`Select ${s.name}`} checked={selected.has(s.id)} onChange={() => toggleSelect(s.id)} />
                </td>
                <td>
                  <span className="signups-name">{s.name}</span>
                  <span className="signups-email">{s.email}</span>
                </td>
                <td>
                  <span className={`status-chip status-${s.status}`}>
                    {s.status}
                    {s.status === 'waitlist' && waitlistPos.has(s.id) && ` #${waitlistPos.get(s.id)}`}
                  </span>
                </td>
                <td>{answersText(s, ', ') || '—'}</td>
                <td>
                  {s.status === 'approved' && (
                    <button
                      type="button"
                      className={s.checked_in_at ? 'signups-toggle checked-in' : 'signups-toggle'}
                      onClick={() => handleToggleCheckedIn(s.id, !s.checked_in_at)}
                    >
                      {s.checked_in_at ? `✓ ${new Date(s.checked_in_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Check in'}
                    </button>
                  )}
                </td>
                <td>{new Date(s.created_at).toLocaleDateString()}</td>
                <td>
                  <span className="row-actions">
                    {s.status === 'pending' && (
                      <>
                        <button type="button" onClick={() => handleDecide(s.id, 'approved')}>Approve</button>
                        <button type="button" className="danger" onClick={() => handleDecide(s.id, 'denied')}>Deny</button>
                      </>
                    )}
                    {s.status === 'waitlist' && (
                      <button type="button" onClick={() => handleDecide(s.id, 'approved')}>Promote</button>
                    )}
                    {s.status === 'approved' && (
                      <button type="button" onClick={() => handleDecide(s.id, 'waitlist')}>Move to waitlist</button>
                    )}
                    {s.status === 'denied' && (
                      <button type="button" onClick={() => handleDecide(s.id, 'approved')}>Approve</button>
                    )}
                    <button type="button" className="danger" onClick={() => handleRemove(s.id)}>Remove</button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
