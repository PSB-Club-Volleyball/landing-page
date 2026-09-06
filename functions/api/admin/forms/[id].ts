import type { Env } from '../../_lib/env'
import { badRequest, json, notFound } from '../../_lib/http'
import type { AdminData } from '../_lib/types'
import { logAudit } from '../_lib/audit'
import { fetchFormFields, validateFields, type FormFieldInput } from '../_lib/forms'
import { requireOwner } from '../_lib/permissions'

// GET /api/admin/forms/:id -> form + its fields, for the builder/edit view
export const onRequestGet: PagesFunction<Env, 'id', AdminData> = async ({ env, params }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return badRequest('Invalid id')

  const form = await env.DB.prepare(`SELECT * FROM forms WHERE id = ?1`).bind(id).first()
  if (!form) return notFound('Form not found')

  const fields = await fetchFormFields(env, id)
  return json({ form: { ...form, fields } })
}

interface FormInput {
  name: string
  fields: FormFieldInput[]
  max_responses?: number | null
  confirmation_message?: string | null
}

// PUT /api/admin/forms/:id -> rename + replace field list. Fields carrying an
// existing id are updated in place (so event_signups.answers keyed by field id
// stays valid); fields without an id are inserted; fields dropped from the
// payload are deleted.
export const onRequestPut: PagesFunction<Env, 'id', AdminData> = async ({ request, env, params, data }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return badRequest('Invalid id')

  const exists = await env.DB.prepare(`SELECT 1 FROM forms WHERE id = ?1`).bind(id).first()
  if (!exists) return notFound('Form not found')

  const body = await request.json<Partial<FormInput>>().catch(() => null)
  if (!body || !body.name || !body.name.trim()) return badRequest('name is required')

  const fieldsError = validateFields(body.fields)
  if (fieldsError) return badRequest(fieldsError)

  const fields = body.fields as FormFieldInput[]
  const existingIds = new Set(
    (await env.DB.prepare(`SELECT id FROM form_fields WHERE form_id = ?1`).bind(id).all<{ id: number }>()).results?.map(
      (r) => r.id
    ) ?? []
  )
  const keptIds = new Set(fields.filter((f) => f.id !== undefined).map((f) => f.id as number))
  const removedIds = [...existingIds].filter((existingId) => !keptIds.has(existingId))

  const statements = [
    env.DB.prepare(
      `UPDATE forms SET name = ?1, max_responses = ?2, confirmation_message = ?3, updated_at = CURRENT_TIMESTAMP WHERE id = ?4`
    ).bind(body.name.trim(), body.max_responses ?? null, body.confirmation_message?.trim() || null, id),
    ...removedIds.map((fieldId) => env.DB.prepare(`DELETE FROM form_fields WHERE id = ?1 AND form_id = ?2`).bind(fieldId, id)),
    ...fields.map((f, i) => {
      const hasOptions = f.field_type === 'select' || f.field_type === 'radio' || f.field_type === 'checkbox_group'
      const options = hasOptions ? (f.options ?? null) : null
      const required = f.field_type === 'section' ? 0 : f.required ? 1 : 0
      const description = f.description?.trim() || null
      const minValue = f.field_type === 'section' ? null : (f.min_value ?? null)
      const maxValue = f.field_type === 'section' ? null : (f.max_value ?? null)
      const pattern = f.field_type === 'section' ? null : f.pattern?.trim() || null
      if (f.id !== undefined && existingIds.has(f.id)) {
        return env.DB.prepare(
          `UPDATE form_fields SET label = ?1, field_type = ?2, options = ?3, required = ?4, sort_order = ?5,
             description = ?6, min_value = ?7, max_value = ?8, pattern = ?9
           WHERE id = ?10 AND form_id = ?11`
        ).bind(f.label.trim(), f.field_type, options, required, i, description, minValue, maxValue, pattern, f.id, id)
      }
      return env.DB.prepare(
        `INSERT INTO form_fields (form_id, label, field_type, options, required, sort_order, description, min_value, max_value, pattern)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
      ).bind(id, f.label.trim(), f.field_type, options, required, i, description, minValue, maxValue, pattern)
    }),
  ]
  await env.DB.batch(statements)

  await logAudit(env, data.user.id, 'update', 'forms', id, { name: body.name, field_count: fields.length })
  return json({ ok: true })
}

// DELETE /api/admin/forms/:id -> owner only, blocked while any event still uses this form
export const onRequestDelete: PagesFunction<Env, 'id', AdminData> = async ({ env, params, data }) => {
  const denied = requireOwner(data)
  if (denied) return denied

  const id = Number(params.id)
  if (!Number.isInteger(id)) return badRequest('Invalid id')

  const inUse = await env.DB.prepare(`SELECT COUNT(*) AS n FROM events WHERE form_id = ?1`).bind(id).first<{ n: number }>()
  if (inUse && inUse.n > 0) {
    return badRequest(`This form is attached to ${inUse.n} event${inUse.n === 1 ? '' : 's'} — detach it first`)
  }

  const result = await env.DB.batch([
    env.DB.prepare(`DELETE FROM form_fields WHERE form_id = ?1`).bind(id),
    env.DB.prepare(`DELETE FROM forms WHERE id = ?1`).bind(id),
  ])
  if (result[1].meta.changes === 0) return notFound('Form not found')

  await logAudit(env, data.user.id, 'delete', 'forms', id)
  return json({ ok: true })
}
