import { BOARD, CONTACT_EMAIL, GROUPME_URL } from '../constants'

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
