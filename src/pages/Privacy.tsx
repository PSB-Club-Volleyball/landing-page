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

        <h3>Security</h3>
        <p>
          Session tokens are stored as one-way hashes, not in plain text, and sign-in relies on Google or
          Microsoft&rsquo;s own authentication rather than a password we&rsquo;d have to store. No method of
          transmission or storage is 100% secure, but we don&rsquo;t collect more than the site needs to run.
        </p>

        <h3>We don&rsquo;t sell your data</h3>
        <p>
          We have never sold, rented, or shared personal information with advertisers or data brokers, and we
          don&rsquo;t intend to. Any use of information received through Google or Microsoft sign-in is limited to
          running this site and is consistent with each provider&rsquo;s API terms, including{' '}
          <a
            className="inline-link"
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
          >
            Google&rsquo;s API Services User Data Policy
          </a>
          .
        </p>

        <h3>Children&rsquo;s privacy</h3>
        <p>
          This site is intended for Penn State Behrend club members, prospective members, and site visitors who are
          at least 18. We don&rsquo;t knowingly collect information from anyone under 13; if you believe a child has
          submitted information to us, contact us and we&rsquo;ll remove it.
        </p>
      </div>
    </main>
  )
}

export default Privacy
