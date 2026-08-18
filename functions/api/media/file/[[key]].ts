import type { Env } from '../../_lib/env'
import { notFound } from '../../_lib/http'

// GET /api/media/file/<r2_key> -> streams the object straight out of R2.
// Kept at a distinct path from /api/media (the list endpoint) because a
// [[key]] optional catch-all also matches its own zero-segment parent path,
// which previously swallowed GET /api/media itself.
// r2_key can contain slashes (e.g. "2025-2026/jordan-reyes.jpg"), hence the
// catch-all route rather than a single dynamic segment.
export const onRequestGet: PagesFunction<Env> = async ({ params, request, env }) => {
  const segments = params.key
  const key = Array.isArray(segments) ? segments.join('/') : (segments ?? '')
  if (!key) return notFound('Missing media key')

  const ifNoneMatch = request.headers.get('if-none-match')
  const object = await env.MEDIA_BUCKET.get(key, {
    onlyIf: ifNoneMatch ? { etagDoesNotMatch: ifNoneMatch } : undefined,
  })

  if (object === null) return notFound('Media not found')

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('cache-control', 'public, max-age=31536000, immutable')

  if (!('body' in object)) {
    // onlyIf matched: object unchanged since the client's cached copy
    return new Response(null, { status: 304, headers })
  }

  return new Response(object.body, { headers })
}
