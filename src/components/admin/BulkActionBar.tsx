import type { ReactNode } from 'react'

// Shown above a table once at least one row is checked. `children` are the
// action controls themselves (a select + apply button, a delete button,
// etc.) — this component only owns the count/clear chrome around them.
function BulkActionBar({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
  if (count === 0) return null
  return (
    <div className="bulk-action-bar">
      <span className="bulk-count">
        {count} selected
      </span>
      <div className="bulk-actions">{children}</div>
      <button type="button" className="link-btn" onClick={onClear}>
        Clear
      </button>
    </div>
  )
}

export default BulkActionBar
