import { useMemo, useState } from 'react'
import { buildPages, FieldInput } from '../../lib/formFields'
import type { PreviewableField } from '../../lib/formFields'

// Renders a form builder draft exactly the way SignupModal renders a real
// one — same field components, same section-per-page pagination — so an
// admin can see what visitors will see before saving. Nothing here submits
// anywhere; "Next"/"Submit" just walk through the preview's own pages.
function FormPreviewModal({
  name,
  fields,
  confirmationMessage,
  onClose,
}: {
  name: string
  fields: PreviewableField[]
  confirmationMessage: string
  onClose: () => void
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [pageIndex, setPageIndex] = useState(0)
  const [submitted, setSubmitted] = useState(false)

  const pages = useMemo(() => buildPages(fields), [fields])
  const onLastPage = pageIndex >= pages.length - 1

  return (
    <div className="signup-overlay" role="dialog" aria-modal="true" aria-label={`Preview: ${name}`} onClick={onClose}>
      <div className="signup-modal" onClick={(e) => e.stopPropagation()}>
        <div className="signup-modal-hd">
          <div>
            <p className="signup-eyebrow">Preview &mdash; not saved anywhere</p>
            <h4>{name || 'Untitled form'}</h4>
          </div>
          <button className="signup-close" type="button" aria-label="Close preview" onClick={onClose}>
            &times;
          </button>
        </div>

        {submitted ? (
          <div className="signup-confirm">
            <div className="signup-confirm-tick">&#10003;</div>
            <h4>You&rsquo;re in!</h4>
            <p>{confirmationMessage || "You're signed up."}</p>
            <button className="btn btn-outline btn-sm" type="button" onClick={onClose}>
              Close preview
            </button>
          </div>
        ) : (
          <form
            className="signup-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (onLastPage) setSubmitted(true)
              else setPageIndex((i) => i + 1)
            }}
          >
            <label className="field">
              <span><span className="req">*</span> Name</span>
              <input type="text" disabled placeholder="(collected automatically)" />
            </label>
            <label className="field">
              <span><span className="req">*</span> Email</span>
              <input type="email" disabled placeholder="(collected automatically)" />
            </label>

            {pages.length > 1 && (
              <p className="signup-page-indicator">
                Page {pageIndex + 1} of {pages.length}
              </p>
            )}
            {pages[pageIndex]?.heading && (
              <div className="signup-section-heading">
                <h5>{pages[pageIndex].heading!.label}</h5>
                {pages[pageIndex].heading!.description && <p>{pages[pageIndex].heading!.description}</p>}
              </div>
            )}
            {pages.length === 0 && <p className="admin-note">Add a field to see it here.</p>}

            {pages[pageIndex]?.fields.map((field) => (
              <label className="field" key={field.id}>
                <span>
                  {field.required && <span className="req">* </span>}
                  {field.label || '(untitled field)'}
                </span>
                {field.description && <span className="field-desc">{field.description}</span>}
                <FieldInput
                  field={field}
                  value={answers[field.id] ?? ''}
                  onChange={(v) => setAnswers({ ...answers, [field.id]: v })}
                />
              </label>
            ))}

            <div className="signup-modal-ft">
              <span className="signup-note" />
              <span className="signup-modal-ft-actions">
                {pageIndex > 0 && (
                  <button className="btn btn-outline" type="button" onClick={() => setPageIndex((i) => i - 1)}>
                    Back
                  </button>
                )}
                <button className="btn btn-ace" type="submit" disabled={pages.length === 0}>
                  {onLastPage ? 'Submit (preview)' : 'Next'}
                </button>
              </span>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default FormPreviewModal
