import { forbidden } from '../../_lib/http'
import type { AdminData } from './types'

// Early-return guard for owner-only routes: `const denied = requireOwner(data); if (denied) return denied`
export function requireOwner(data: AdminData): Response | null {
  if (data.user.role !== 'owner') return forbidden('Owner only')
  return null
}
