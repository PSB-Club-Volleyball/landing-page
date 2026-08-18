import type { SessionUser } from '../../_lib/session'

export interface AdminData extends Record<string, unknown> {
  user: SessionUser
}
