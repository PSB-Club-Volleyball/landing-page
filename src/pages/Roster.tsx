import { useEffect, useState } from 'react'
import { getBoard, getRoster } from '../lib/api'
import { CONTACT_EMAIL, GROUPME_URL } from '../constants'
import type { BoardMember, Player } from '../types'

function playerName(p: Player) {
  return `${p.first_name} ${p.last_name}`
}

function boardName(b: BoardMember) {
  return `${b.first_name} ${b.last_name}`
}

function Roster() {
  const [players, setPlayers] = useState<Player[] | null>(null)
  const [board, setBoard] = useState<BoardMember[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    Promise.all([getRoster(), getBoard()])
      .then(([rosterRes, boardRes]) => {
        if (cancelled) return
        setPlayers(rosterRes.players)
        setBoard(boardRes.board)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main>
      <div className="board">
        <h2>Team roster</h2>
        {error && (
          <p className="placeholder-note">
            Couldn&rsquo;t load the roster right now &mdash; try refreshing.
          </p>
        )}
        {!error && players !== null && players.length === 0 && (
          <p className="placeholder-note">
            Player roster for the season is still being finalized. Check back
            once tryouts wrap up.
          </p>
        )}
        {players !== null && players.length > 0 && (
          <ul className="roster-grid">
            {players.map((p) => (
              <li key={p.id} className="player-card">
                {p.jersey_number !== null && <span className="num">{p.jersey_number}</span>}
                <span className="pname">{playerName(p)}</span>
                <span className="ppos">
                  {[p.position, p.class_year].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        )}

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
