import { useEffect } from 'react'
import type { ReactNode } from 'react'

// Generic popup shell for admin create/edit forms — reuses the same
// overlay/card look as the public signup modal (see App.css's
// .signup-overlay/.signup-modal) so the two visual languages stay in sync.
function AdminModal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="signup-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className={`signup-modal admin-modal${wide ? ' admin-modal-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="signup-modal-hd">
          <h4>{title}</h4>
          <button className="signup-close" type="button" aria-label="Close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="admin-modal-body">{children}</div>
      </div>
    </div>
  )
}

export default AdminModal
