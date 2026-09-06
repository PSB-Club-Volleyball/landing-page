import type { Env } from '../../_lib/env'

export interface LoginSettings {
  google_enabled: boolean
  microsoft_enabled: boolean
  current_season: string | null
}

export async function getLoginSettings(env: Env): Promise<LoginSettings> {
  const row = await env.DB.prepare(
    `SELECT google_enabled, microsoft_enabled, current_season FROM login_settings WHERE id = 1`
  ).first<{
    google_enabled: number
    microsoft_enabled: number
    current_season: string | null
  }>()
  if (!row) throw new Error('login_settings row missing — run migrations')
  return {
    google_enabled: row.google_enabled === 1,
    microsoft_enabled: row.microsoft_enabled === 1,
    current_season: row.current_season,
  }
}

// The "current_season" setting alone, for callers (roster auto-add) that
// don't need the login-provider toggles.
export async function getCurrentSeason(env: Env): Promise<string | null> {
  const row = await env.DB.prepare(`SELECT current_season FROM login_settings WHERE id = 1`).first<{
    current_season: string | null
  }>()
  return row?.current_season ?? null
}

export function isProviderEnabled(name: string, settings: LoginSettings): boolean {
  if (name === 'google') return settings.google_enabled
  if (name === 'microsoft') return settings.microsoft_enabled
  return false
}
