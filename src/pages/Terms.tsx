import { CONTACT_EMAIL, WAIVER_URL } from '../constants'

function Terms() {
  return (
    <main id="main-content" tabIndex={-1}>
      <div className="board legal-page">
        <h1>Terms of use</h1>
        <p className="legal-updated">Last updated September 2026.</p>

        <p>
          These terms cover use of this website, run by Behrend Club Volleyball, a student club at Penn State
          Behrend. By using the site &mdash; browsing, signing up for an event, or signing in &mdash; you agree to
          them. If you don&rsquo;t agree, please don&rsquo;t use the site.
        </p>

        <h2>Assumption of risk</h2>
        <p>
          Volleyball and related club activities carry an inherent risk of injury. Signing up for an event through
          this site does not replace the club&rsquo;s{' '}
          <a className="inline-link" href={WAIVER_URL} target="_blank" rel="noreferrer">
            liability waiver
          </a>
          , which must be signed and brought to the event before you can participate. By registering, you
          acknowledge that participation is voluntary and at your own risk.
        </p>

        <h2>No warranty</h2>
        <p>
          Event dates, times, capacity, and other details are provided by club volunteers and may change. We do our
          best to keep them accurate but don&rsquo;t guarantee it &mdash; the site and its content are provided
          &ldquo;as is,&rdquo; without warranties of any kind. Always confirm event-day details directly with the
          club if you&rsquo;re unsure.
        </p>

        <h2>Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, Behrend Club Volleyball and its board members aren&rsquo;t liable
          for any indirect, incidental, or consequential damages arising from your use of this site or participation
          in club events, beyond what&rsquo;s already addressed by the liability waiver.
        </p>

        <h2>Account use</h2>
        <p>
          Signing in with Google or Microsoft is optional and just links your club activity to your existing
          account &mdash; see our{' '}
          <a className="inline-link" href="/privacy">
            privacy policy
          </a>{' '}
          for what that shares. Don&rsquo;t use someone else&rsquo;s account or submit false information on a
          signup form.
        </p>

        <h2>Governing law</h2>
        <p>These terms are governed by the laws of the Commonwealth of Pennsylvania.</p>

        <h2>Questions</h2>
        <p>
          Email{' '}
          <a className="inline-link" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>{' '}
          with any questions about these terms.
        </p>
      </div>
    </main>
  )
}

export default Terms
