import { useEffect, useState } from 'react'
import { getBoard, getRoster } from '../lib/api'
import { CONTACT_EMAIL, GROUPME_URL } from '../constants'
import type { BoardMember, Division, Player } from '../types'

function playerName(p: Player) {
  return `${p.first_name} ${p.last_name}`
}

// Players with no division yet (e.g. just auto-added from an account) still
// show, under a plain heading, rather than vanishing from the public page.
const SECTIONS: { title: string; division: Division | null }[] = [
  { title: "Women's team", division: 'women' },
  { title: "Men's team", division: 'men' },
  { title: 'Players', division: null },
]

// Numbered players first in number order; unnumbered ones keep the API's order.
function byNumber(players: Player[]) {
  return [...players].sort((a, b) => (a.jersey_number ?? Number.MAX_SAFE_INTEGER) - (b.jersey_number ?? Number.MAX_SAFE_INTEGER))
}

function boardName(b: BoardMember) {
  return `${b.first_name} ${b.last_name}`
}

function Roster() {
  const [players, setPlayers] = useState<Player[] | null>(null)
  const [rosterVisible, setRosterVisible] = useState(true)
  const [board, setBoard] = useState<BoardMember[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    Promise.all([getRoster(), getBoard()])
      .then(([rosterRes, boardRes]) => {
        if (cancelled) return
        setPlayers(rosterRes.players)
        setRosterVisible(rosterRes.visible)
        setBoard(boardRes.board)
      })
      .catch((err: unknown) => {
        console.error('Failed to load roster', err)
        if (!cancelled) setError(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="board">
        <h1>Team roster</h1>
        {error && (
          <p className="placeholder-note">
            Couldn&rsquo;t load the roster right now &mdash; try refreshing.
          </p>
        )}
        {!error && players !== null && !rosterVisible && (
          <p className="placeholder-note">The roster isn&rsquo;t posted yet &mdash; check back soon.</p>
        )}
        {!error && players !== null && rosterVisible && players.length === 0 && (
          <p className="placeholder-note">
            Player roster for the season is still being finalized. Check back
            once tryouts wrap up.
          </p>
        )}
        {players !== null &&
          rosterVisible &&
          SECTIONS.map(({ title, division }) => {
            const list = byNumber(players.filter((p) => p.division === division))
            if (list.length === 0) return null
            return (
              <section key={title}>
                <h2 className="roster-heading">
                  {title}
                  <span className="count">
                    {list.length} {list.length === 1 ? 'player' : 'players'}
                  </span>
                </h2>
                <ul className="roster-grid">
                  {list.map((p) => (
                    <li key={p.id} className="player-card">
                      {p.jersey_number !== null && <span className="num">{p.jersey_number}</span>}
                      <span className="pname">{playerName(p)}</span>
                      <span className="ppos">
                        {[p.position, p.class_year].filter(Boolean).join(' · ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}

        <h2>Board</h2>
        <ul className="board-list">
          {(board ?? []).map((member) => (
            <li key={member.id}>
              <span className="role">{member.role}</span>
              <span className="name">{boardName(member)}</span>
            </li>
          ))}
        </ul>
        <p className="board-contact">
          Have a question for the board? Email{' '}
          <a className="inline-link" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>{' '}
          or join our{' '}
          <a
            className="inline-link"
            href={GROUPME_URL}
            target="_blank"
            rel="noreferrer"
          >
            GroupMe
          </a>
          .
        </p>
      </div>
    </main>
  )
}

export default Roster
