import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import type { LoginSettings } from '../../types'

function SettingsAdmin() {
  const [settings, setSettings] = useState<LoginSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    adminApi.settings
      .get()
      .then(setSettings)
      .catch((e: Error) => setError(e.message))
  }, [])

  function save(previous: LoginSettings, next: LoginSettings) {
    if (!next.google_enabled && !next.microsoft_enabled) {
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
            Allow signing in with Microsoft
          </label>
        </fieldset>
      )}
    </>
  )
}

export default SettingsAdmin
