import { CONTACT_EMAIL, GROUPME_URL } from '../constants'

function Home() {
  return (
    <>
      <section className="hero">
        <p className="eyebrow">Penn State Behrend</p>
        <h1>
          <span>Club</span>
          <span>Volleyball</span>
        </h1>
        <p className="tagline">
          Highly competitive, team-based volleyball at Penn State Behrend. We
          practice weekly to prepare for tournaments and compete in the
          Eastern Collegiate Volleyball Association (ECVA), the regional
          league operating under the National Collegiate Volleyball
          Federation (NCVF).
        </p>
        <a className="cta" href={`mailto:${CONTACT_EMAIL}`}>
          Join the club
        </a>
      </section>

      <div className="scoreboard">
        <div>
          <div className="label">Practices</div>
          <div className="value">TBD</div>
        </div>
        <div>
          <div className="label">Location</div>
          <div className="value">Erie Hall</div>
        </div>
        <div>
          <div className="label">Season</div>
          <div className="value">Fall &amp; Spring</div>
        </div>
      </div>

      <main>
        <div className="split">
          <div>
            <h2>About the club</h2>
            <p>
              This club is for anyone who wants to play volleyball in a
              highly competitive, team-based setting. We meet weekly for
              practice in preparation for tournaments and to sharpen our
              skills, and we compete in the Eastern Collegiate Volleyball
              Association (ECVA), the regional league operating under the
              National Collegiate Volleyball Federation (NCVF).
            </p>
            <p>Prior volleyball experience is highly recommended.</p>
          </div>
          <div className="join-card">
            <h2>How to join</h2>
            <p>
              Details on tryouts and practice times are still being finalized
              for the season. Email us to get on the list and be notified as
              soon as they&rsquo;re set.
            </p>
            <a className="signup-link" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            <p className="or-note">
              or{' '}
              <a
                className="inline-link"
                href={GROUPME_URL}
                target="_blank"
                rel="noreferrer"
              >
                join our GroupMe
              </a>
            </p>
          </div>
        </div>
      </main>
    </>
  )
}

export default Home
