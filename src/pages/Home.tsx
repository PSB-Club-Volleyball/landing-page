import {
  CONTACT_EMAIL,
  GROUPME_URL,
  LOCATION_MAP_URL,
  LOCATION_NAME,
} from '../constants'

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
          Highly competitive, team-based volleyball at Penn State Behrend,
          competing in the ECVA. No practices right now while the board
          finalizes tryouts &mdash; join us for weekly open gyms.
        </p>
        <a className="cta" href={`mailto:${CONTACT_EMAIL}`}>
          Join the club
        </a>
      </section>

      <div className="scoreboard">
        <div>
          <div className="label">Location</div>
          <div className="value">
            <a
              className="location-link"
              href={LOCATION_MAP_URL}
              target="_blank"
              rel="noreferrer"
            >
              {LOCATION_NAME}
            </a>
          </div>
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
              highly competitive, team-based setting. We compete in the
              Eastern Collegiate Volleyball Association (ECVA), the regional
              league operating under the National Collegiate Volleyball
              Federation (NCVF).
            </p>
            <p>Prior volleyball experience is highly recommended.</p>
          </div>
          <div className="join-card">
            <h2>How to join</h2>
            <p>
              There are no practices right now &mdash; the board is still
              deciding on tryouts. Until then, we&rsquo;re holding weekly
              open gyms. Join our GroupMe for times and details.
            </p>
            <a
              className="signup-link"
              href={GROUPME_URL}
              target="_blank"
              rel="noreferrer"
            >
              Join our GroupMe
            </a>
            <p className="or-note">
              or email{' '}
              <a className="inline-link" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
            </p>
          </div>
        </div>
      </main>
    </>
  )
}

export default Home
