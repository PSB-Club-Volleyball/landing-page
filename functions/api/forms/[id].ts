import type { Env } from '../_lib/env'
import { badRequest, json, notFound } from '../_lib/http'
import { fetchFormFields } from '../_lib/forms'

// GET /api/forms/:id -> name + fields only, for rendering the public RSVP/signup modal.
// No auth required — a form's field schema isn't sensitive, unlike its responses.
export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return badRequest('Invalid id')

  const form = await env.DB.prepare(`SELECT id, name FROM forms WHERE id = ?1`).bind(id).first()
  if (!form) return notFound('Form not found')

  const fields = await fetchFormFields(env, id)
  return json({ form: { ...form, fields } })
}
