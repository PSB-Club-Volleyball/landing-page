import type { Env } from '../_lib/env'
import { badRequest, json } from '../_lib/http'
import type { AdminData } from './_lib/types'
import { logAudit } from './_lib/audit'
import { validateFields, type FormFieldInput } from './_lib/forms'

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
}

// POST /api/admin/forms -> create a form with its fields in one go
export const onRequestPost: PagesFunction<Env, string, AdminData> = async ({ request, env, data }) => {
  const body = await request.json<Partial<FormInput>>().catch(() => null)
  if (!body || !body.name || !body.name.trim()) return badRequest('name is required')

  const fieldsError = validateFields(body.fields)
  if (fieldsError) return badRequest(fieldsError)

  const result = await env.DB.prepare(`INSERT INTO forms (name) VALUES (?1)`).bind(body.name.trim()).run()
  const formId = Number(result.meta.last_row_id)

  const fields = body.fields as FormFieldInput[]
  await env.DB.batch(
    fields.map((f, i) =>
      env.DB.prepare(
        `INSERT INTO form_fields (form_id, label, field_type, options, required, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      ).bind(formId, f.label.trim(), f.field_type, f.field_type === 'select' ? (f.options ?? null) : null, f.required ? 1 : 0, i)
    )
  )

  await logAudit(env, data.user.id, 'create', 'forms', formId, { name: body.name, field_count: fields.length })
  return json({ id: formId }, { status: 201 })
}
