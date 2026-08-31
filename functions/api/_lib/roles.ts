export type UserRole = 'outsider' | 'club_member' | 'admin' | 'owner'

// Ordered, not a set of independent flags — each tier includes the
// permissions of every tier below it. "admin/owner are necessarily club
// members" is true by construction rather than a separate check.
const RANK: Record<UserRole, number> = { outsider: 0, club_member: 1, admin: 2, owner: 3 }

export function roleRank(role: string): number {
  return RANK[role as UserRole] ?? 0
}

export function isAtLeast(role: string, min: UserRole): boolean {
  return roleRank(role) >= RANK[min]
}
