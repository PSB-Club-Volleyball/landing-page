import { formatSigned } from '../lib/eventFormat'
import type { StandingRow } from '../types'

// Read-only standings table shared by the public Scores and Pools tabs.
export default function StandingsTable({ standings }: { standings: StandingRow[] }) {
  return (
    <div className="data-table public-standings">
      <table>
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Team</th>
            <th className="num">W</th>
            <th className="num">L</th>
            <th className="num">Sets</th>
            <th className="num" aria-label="Point differential">+/&minus;</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((r, i) => (
            <tr key={r.team_id}>
              <td className="num">{i + 1}</td>
              <td>{r.name}</td>
              <td className="num">{r.wins}</td>
              <td className="num">{r.losses}</td>
              <td className="num">
                {r.sets_won}&ndash;{r.sets_lost}
              </td>
              <td className="num">{formatSigned(r.points_for - r.points_against)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
