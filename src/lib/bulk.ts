// Bulk actions run each item's request through the same single-item admin
// endpoint used elsewhere (so permission checks, audit logging, etc. all
// stay in one place) rather than a dedicated batch endpoint — sequential,
// not parallel, since D1 handles one write at a time per request anyway.
export interface BulkResult {
  ok: number
  failed: number
  errors: string[]
}

export async function runBulk<T>(items: T[], fn: (item: T) => Promise<unknown>): Promise<BulkResult> {
  let ok = 0
  const errors: string[] = []
  for (const item of items) {
    try {
      await fn(item)
      ok++
    } catch (e) {
      errors.push((e as Error).message)
    }
  }
  return { ok, failed: errors.length, errors }
}

// Null when every item succeeded (nothing worth telling the admin), else a
// one-line summary suitable for the page's existing error banner.
export function summarizeBulk(result: BulkResult, verb: string): string | null {
  if (result.failed === 0) return null
  const rest = result.failed > 1 ? ` (+${result.failed - 1} more)` : ''
  return `${verb}: ${result.ok} succeeded, ${result.failed} failed — ${result.errors[0]}${rest}`
}
