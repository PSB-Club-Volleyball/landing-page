import type { Env } from '../../_lib/env'

export interface LoginSettings {
  google_enabled: boolean
  microsoft_enabled: boolean
}

export async function getLoginSettings(env: Env): Promise<LoginSettings> {
  const row = await env.DB.prepare(`SELECT google_enabled, microsoft_enabled FROM login_settings WHERE id = 1`).first<{
    google_enabled: number
    microsoft_enabled: number
  }>()
  if (!row) throw new Error('login_settings row missing — run migrations')
  return { google_enabled: row.google_enabled === 1, microsoft_enabled: row.microsoft_enabled === 1 }
}

export function isProviderEnabled(name: string, settings: LoginSettings): boolean {
  if (name === 'google') return settings.google_enabled
  if (name === 'microsoft') return settings.microsoft_enabled
  return false
}
