import type { Env } from '../../_lib/env'
import type { OAuthProfile } from './providers'

export type SignInResult = { userId: number } | { error: 'account_exists' }

// Finds (or creates) the account a verified OAuth profile signs into:
//   1. the account that already has this provider login;
//   2. else, when the provider vouches for the email (emailIsAuthoritative)
//      and the account holding that email may be claimed (canClaim), that
//      account, with this login attached;
//   3. else a new outsider account (admin/owner for bootstrap emails) — or
//      account_exists, when another account holds the email.
// An email the provider doesn't vouch for never links to an existing
// account.
export async function resolveSignIn(
  env: Env,
  opts: { provider: string; profile: OAuthProfile; emailIsAuthoritative: boolean; isBootstrap: boolean }
): Promise<SignInResult> {
  const { provider, profile, emailIsAuthoritative, isBootstrap } = opts

  // If a bootstrap email is signing in and nobody holds the owner role yet, this
  // login claims it — self-healing, so a fresh deploy or a wiped owner never
  // needs a manual data patch.
  let assignOwner = false
  if (isBootstrap) {
    const owner = await env.DB.prepare(`SELECT id FROM users WHERE role = 'owner'`).first<{ id: number }>()
    assignOwner = !owner
  }

  const byLogin = await env.DB.prepare(`SELECT user_id FROM user_logins WHERE provider = ?1 AND provider_sub = ?2`)
    .bind(provider, profile.sub)
    .first<{ user_id: number }>()
  let userId = byLogin?.user_id ?? null
  let claimed = false
  if (userId === null && emailIsAuthoritative) {
    const holder = await env.DB.prepare(
      `SELECT ue.user_id, (ue.email = LOWER(u.email)) AS is_primary,
              (SELECT COUNT(*) FROM user_logins l WHERE l.user_id = ue.user_id) AS logins
       FROM user_emails ue JOIN users u ON u.id = ue.user_id WHERE ue.email = ?1`
    )
      .bind(profile.email)
      .first<Holder>()
    if (holder && canClaim(holder)) {
      userId = holder.user_id
      claimed = true
    }
  }

  // Lost the race to claim the owner role — another concurrent bootstrap
  // login won it between the "no owner yet" check and this write
  // (idx_users_single_owner). That login is still otherwise valid, so retry
  // once as admin instead of failing it. Any other error propagates.
  const withOwnerRetry = async <T>(write: () => Promise<T>): Promise<T> => {
    try {
      return await write()
    } catch (e) {
      if (!assignOwner || !isUniqueViolation(e, 'role')) throw e
      assignOwner = false
      return await write()
    }
  }

  try {
    if (userId !== null) {
      const id = userId
      await withOwnerRetry(() => {
        const stmts = []
        if (claimed) {
          stmts.push(
            env.DB.prepare(`INSERT INTO user_logins (provider, provider_sub, user_id) VALUES (?1, ?2, ?3)`).bind(
              provider,
              profile.sub,
              id
            ),
            // An admin-created account records who it now belongs to.
            env.DB.prepare(
              `UPDATE users SET provider = ?1, provider_sub = ?2 WHERE id = ?3 AND provider = 'none'`
            ).bind(provider, profile.sub, id)
          )
        } else if (emailIsAuthoritative) {
          // The provider's email may have changed since this login was first
          // used; a vouched-for address joins the account unless another
          // account already holds it. The primary email only changes when an
          // admin picks one.
          stmts.push(
            env.DB.prepare(`INSERT OR IGNORE INTO user_emails (email, user_id) VALUES (?1, ?2)`).bind(profile.email, id)
          )
        }
        // Re-assert admin rank on every bootstrap login, not just at account
        // creation — otherwise a bootstrap email demoted before it was added
        // to (or corrected in) ADMIN_BOOTSTRAP_EMAILS stays stuck. Never
        // downgrades an existing owner. name is never synced from the
        // provider on login: it stays whatever the account (or an admin) set.
        const role = !isBootstrap ? '' : `, role = ${assignOwner ? `'owner'` : `CASE WHEN role = 'owner' THEN role ELSE 'admin' END`}`
        stmts.push(env.DB.prepare(`UPDATE users SET avatar_url = ?1${role} WHERE id = ?2`).bind(profile.picture, id))
        return env.DB.batch(stmts)
      })
      return { userId: id }
    }

    // A new signup is an outsider with no admin permissions; an admin promotes
    // them later from the Users tab. The users insert trigger (migration 0033)
    // adds its email and login rows in the same statement.
    const inserted = await withOwnerRetry(() =>
      env.DB.prepare(
        `INSERT INTO users (email, name, avatar_url, provider, provider_sub, role)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      )
        .bind(
          profile.email,
          profile.name,
          profile.picture,
          provider,
          profile.sub,
          assignOwner ? 'owner' : isBootstrap ? 'admin' : 'outsider'
        )
        .run()
    )
    return { userId: Number(inserted.meta.last_row_id) }
  } catch (e) {
    // The profile's email already belongs to another account and the
    // provider doesn't vouch for it (or a concurrent sign-in took it first).
    // An expected user-facing situation, not a server fault.
    if (isUniqueViolation(e, 'email')) return { error: 'account_exists' }
    throw e
  }
}

interface Holder {
  user_id: number
  is_primary: number
  logins: number
}

// Whether a sign-in the provider vouches for may attach to the account that
// holds its email, rather than getting account_exists: only an account an
// admin created that nobody has signed into yet (no logins), and only
// through its primary email — the address it was created for. Its other
// emails don't count, or an admin could add their own address to someone's
// pre-made account and claim it first.
//
// Everything else is deliberately refused. An account someone already signs
// into never gains a new login through its emails: a sign-in-brought address
// may be unverified or recycled, and an admin-added one would let any admin
// add an address they control and sign in as that member. One person with
// two sign-ins signs in once with each, and an admin merges the two accounts
// (admin/users/[id]/merge.ts).
function canClaim(holder: Holder): boolean {
  return holder.logins === 0 && holder.is_primary === 1
}

export function isUniqueViolation(e: unknown, column: 'email' | 'role'): boolean {
  const target = column === 'email' ? '(users|user_emails)\\.email' : 'users\\.role'
  return e instanceof Error && new RegExp(`UNIQUE constraint failed: ${target}\\b`, 'i').test(e.message)
}
