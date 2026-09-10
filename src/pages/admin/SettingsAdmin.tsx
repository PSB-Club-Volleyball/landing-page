import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import type { LoginSettings } from '../../types'

function SettingsAdmin() {
  const [settings, setSettings] = useState<LoginSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [seasonDraft, setSeasonDraft] = useState('')

  useEffect(() => {
    adminApi.settings
      .get()
      .then((res) => {
        setSettings(res)
        setSeasonDraft(res.current_season ?? '')
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  function saveSeason() {
    if (!settings) return
    const next = { ...settings, current_season: seasonDraft.trim() || null }
    setSettings(next)
    setSaving(true)
    setError(null)
    adminApi.settings
      .update(next)
      .catch((e: Error) => {
        setSettings(settings)
        setSeasonDraft(settings.current_season ?? '')
        setError(e.message)
      })
      .finally(() => setSaving(false))
  }

  function save(previous: LoginSettings, next: LoginSettings) {
    if (!next.google_enabled && !next.microsoft_enabled && !next.microsoft_other_enabled) {
      setError('At least one sign-in provider must stay enabled')
      return
    }
    setSettings(next)
    setSaving(true)
    setError(null)
    adminApi.settings
      .update(next)
      .catch((e: Error) => {
        setSettings(previous)
        setError(e.message)
      })
      .finally(() => setSaving(false))
  }

  return (
    <>
      <div className="admin-main-head">
        <h2>Settings</h2>
      </div>
      {error && <p className="admin-error">{error}</p>}
      {!settings && !error && <p>Loading&hellip;</p>}
      {settings && (
        <fieldset className="signup-fieldset">
          <legend>Sign-in providers</legend>
          <p className="admin-note">
            Turning a provider off stops new sign-ins through it. Anyone already signed in keeps their session, and
            existing accounts created with that provider aren&rsquo;t affected.
          </p>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={settings.google_enabled}
              disabled={saving}
              onChange={(e) => save(settings, { ...settings, google_enabled: e.target.checked })}
            />
            Allow signing in with Google
          </label>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={settings.microsoft_enabled}
              disabled={saving}
              onChange={(e) => save(settings, { ...settings, microsoft_enabled: e.target.checked })}
            />
            Allow signing in with Microsoft (Penn State accounts)
          </label>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={settings.microsoft_other_enabled}
              disabled={saving}
              onChange={(e) => save(settings, { ...settings, microsoft_other_enabled: e.target.checked })}
            />
            Allow signing in with a non-PSU Microsoft account
          </label>
          <p className="admin-note">
            The non-PSU Microsoft option needs its own Azure app registration and secrets configured first
            &mdash; see docs/backend-setup.md. Leave it off until that&rsquo;s done.
          </p>
        </fieldset>
      )}
      {settings && (
        <fieldset className="signup-fieldset" style={{ marginTop: '1rem' }}>
          <legend>Roster</legend>
          <p className="admin-note">
            Setting the current season auto-adds every approved club member and admin to the roster for that season
            (using their account name and position) — both right away and whenever someone new is approved or
            promoted. It never removes anyone, and never overwrites a roster row added by hand.
          </p>
          <label className="field" style={{ maxWidth: '16rem' }}>
            Current season
            <input
              placeholder="2025-2026"
              value={seasonDraft}
              disabled={saving}
              onChange={(e) => setSeasonDraft(e.target.value)}
            />
          </label>
          <div className="form-actions form-actions-start">
            <button className="btn btn-ace" type="button" disabled={saving} onClick={saveSeason}>
              {saving ? 'Saving…' : 'Save season'}
            </button>
          </div>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={settings.roster_visible}
              disabled={saving}
              onChange={(e) => save(settings, { ...settings, roster_visible: e.target.checked })}
            />
            Show the player roster on the public site
          </label>
          <p className="admin-note">
            Turning this off hides the player list on the Roster page (e.g. before tryouts are finalized) — the Board
            section stays visible, and no roster data is deleted.
          </p>
        </fieldset>
      )}
    </>
  )
}

export default SettingsAdmin
