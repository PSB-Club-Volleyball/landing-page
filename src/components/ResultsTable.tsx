import { Link } from 'react-router-dom'
import type { PlayerResult } from '../types'

// Per-event results for one player, shared by /profile and /members/:id.
export default function ResultsTable({ results }: { results: PlayerResult[] }) {
  return (
    <div className="data-table public-standings">
      <table>
        <thead>
          <tr>
            <th>Event</th>
            <th>Team</th>
            <th className="num">W</th>
            <th className="num">L</th>
            <th className="num">Sets</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.eventId}>
              <td>
                <Link to={`/events/${r.eventId}`}>{r.title}</Link>
              </td>
              <td className="nowrap">{r.teamName}</td>
              <td className="num">{r.wins}</td>
              <td className="num">{r.losses}</td>
              <td className="num">
                {r.setsWon}&ndash;{r.setsLost}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
