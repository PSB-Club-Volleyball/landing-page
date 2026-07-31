import { BOARD } from '../constants'

function Roster() {
  return (
    <main>
      <div className="board">
        <h2>Team roster</h2>
        <p className="placeholder-note">
          Player roster for the season is still being finalized. Check back
          once tryouts wrap up.
        </p>
        <h2>Board</h2>
        <ul className="board-list">
          {BOARD.map((member) => (
            <li key={member.role}>
              <span className="role">{member.role}</span>
              <span className="name">{member.name}</span>
              {member.email && (
                <a href={`mailto:${member.email}`}>{member.email}</a>
              )}
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}

export default Roster
