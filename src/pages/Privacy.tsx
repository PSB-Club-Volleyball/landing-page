import { CONTACT_EMAIL } from '../constants'

function Privacy() {
  return (
    <main>
      <div className="board legal-page">
        <h2>Privacy policy</h2>
        <p className="legal-updated">Last updated September 2026.</p>

        <p>
          Behrend Club Volleyball ({CONTACT_EMAIL}) runs this site to share club info and let people sign up for
          events. This page explains what we collect and why. We don&rsquo;t sell data, run ads, or share anything
          with third parties beyond what&rsquo;s described below.
        </p>

        <h3>What we collect</h3>
        <ul>
          <li>
            <b>Event signups:</b> the name, email, and any answers you submit on an event&rsquo;s signup form (used
            to run the event, track attendance/capacity, and email you about it).
          </li>
          <li>
            <b>Account sign-in:</b> if you choose to sign in with Google or Microsoft, we receive your name, email,
            and profile photo from that provider. Signing in is optional &mdash; you can sign up for events as a
            guest without one.
          </li>
          <li>
            <b>Roster &amp; board info:</b> names, jersey numbers, positions, and photos for players and board
            members who are part of the club, published on the public site.
          </li>
          <li>
            <b>Cookies:</b> a session cookie once you sign in, and a short-lived cookie during the sign-in redirect
            itself. Both are strictly functional (keeping you logged in) &mdash; we don&rsquo;t use tracking or
            advertising cookies.
          </li>
        </ul>

        <h3>How it&rsquo;s used</h3>
        <p>
          Signup and account info is used only to run club events and communicate with you about them (confirmations,
          waitlist/approval updates, cancellations). Board members can see and manage this data to run the club;
          it&rsquo;s not shared outside the club or used for any other purpose.
        </p>

        <h3>How long we keep it</h3>
        <p>
          Event signups and roster/board entries are kept for as long as they&rsquo;re relevant to the club (roughly
          the season), then removed. Sessions expire automatically after 30 days of inactivity.
        </p>

        <h3>Your choices</h3>
        <p>
          You can cancel an event signup at any time using the link emailed to you or, if you&rsquo;re signed in,
          from the event card. To request that we delete your data or answer any other question, email{' '}
          <a className="inline-link" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </div>
    </main>
  )
}

export default Privacy
