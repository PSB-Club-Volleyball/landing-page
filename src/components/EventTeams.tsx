import type { PublicEventTeam } from '../types'

// Read-only team rosters on the public event page's Teams tab. Captains are
// marked (C).
export default function EventTeams({ teams }: { teams: PublicEventTeam[] }) {
  if (teams.length === 0) return null
  return (
    <div className="public-teams">
      <p className="public-teams-note">Teams posted by the club. A name marked (C) is that team&rsquo;s captain.</p>
      <div className="public-team-grid">
        {teams.map((team) => (
          <div className="public-team" key={team.id}>
            <header>
              {team.name}
              {team.pool && <span className="public-team-pool">Pool {team.pool}</span>}
            </header>
            <ol>
              {team.members.map((m, i) => (
                <li key={i} className={m.is_captain ? 'captain' : undefined}>
                  {m.name}
                  {m.is_captain && <span className="captain-tag"> (C)</span>}
                </li>
              ))}
              {team.members.length === 0 && <li className="public-team-empty">No players listed</li>}
            </ol>
          </div>
        ))}
      </div>
    </div>
  )
}
