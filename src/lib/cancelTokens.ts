// Guest un-RSVP has no account to check status against, so the cancel
// credential shown once at submit time is also kept here — lets a guest who
// comes back to the same browser still see a cancel option on the event card.
const STORAGE_KEY = 'rsvp_cancel_tokens'

interface StoredSignup {
  signupId: number
  token: string
}

function readAll(): Record<string, StoredSignup> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function storeCancelToken(eventId: number, signupId: number, token: string) {
  const all = readAll()
  all[eventId] = { signupId, token }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function getCancelToken(eventId: number): StoredSignup | null {
  return readAll()[eventId] ?? null
}

export function clearCancelToken(eventId: number) {
  const all = readAll()
  delete all[eventId]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}
