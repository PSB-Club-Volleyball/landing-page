import type { Env } from '../_lib/env'
import { badRequest, json } from '../_lib/http'
import type { AdminData } from './_lib/types'
import { logAudit } from './_lib/audit'
import { CHOICE_FIELD_TYPES, validateFields, type FormFieldInput } from './_lib/forms'

// GET /api/admin/forms -> every saved form with field/usage counts, for the Forms tab list
export const onRequestGet: PagesFunction<Env, string, AdminData> = async ({ env }) => {
  const forms = await env.DB.prepare(
    `SELECT f.*,
            (SELECT COUNT(*) FROM form_fields ff WHERE ff.form_id = f.id) AS field_count,
            (SELECT COUNT(*) FROM events e WHERE e.form_id = f.id) AS used_count
     FROM forms f
     ORDER BY f.name ASC`
  ).all()
  return json({ forms: forms.results ?? [] })
}

interface FormInput {
  name: string
  fields: FormFieldInput[]
  max_responses?: number | null
  confirmation_message?: string | null
}

// POST /api/admin/forms -> create a form with its fields in one go
export const onRequestPost: PagesFunction<Env, string, AdminData> = async ({ request, env, data }) => {
  const body = await request.json<Partial<FormInput>>().catch(() => null)
  if (!body || !body.name || !body.name.trim()) return badRequest('name is required')

  const fieldsError = validateFields(body.fields)
  if (fieldsError) return badRequest(fieldsError)

  // One batch (one transaction) so a failing field insert can't leave an
  // empty form behind. The first field takes the form's id from
  // last_insert_rowid(); each later one copies form_id from the field
  // inserted just before it.
  const fields = body.fields as FormFieldInput[]
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO forms (name, max_responses, confirmation_message) VALUES (?1, ?2, ?3)`).bind(
      body.name.trim(),
      body.max_responses ?? null,
      body.confirmation_message?.trim() || null
    ),
    ...fields.map((f, i) => {
      const hasOptions = CHOICE_FIELD_TYPES.includes(f.field_type)
      const formIdSql = i === 0 ? 'last_insert_rowid()' : '(SELECT form_id FROM form_fields WHERE id = last_insert_rowid())'
      return env.DB.prepare(
        `INSERT INTO form_fields (form_id, label, field_type, options, required, sort_order, description, min_value, max_value, pattern)
         VALUES (${formIdSql}, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
      ).bind(
        f.label.trim(),
        f.field_type,
        hasOptions ? (f.options ?? null) : null,
        f.field_type === 'section' ? 0 : f.required ? 1 : 0,
        i,
        f.description?.trim() || null,
        f.field_type === 'section' ? null : (f.min_value ?? null),
        f.field_type === 'section' ? null : (f.max_value ?? null),
        f.field_type === 'section' ? null : (f.pattern?.trim() || null)
      )
    }),
  ])
  const formId = Number(results[0].meta.last_row_id)

  await logAudit(env, data.user.id, 'create', 'forms', formId, { name: body.name, field_count: fields.length })
  return json({ id: formId }, { status: 201 })
}
