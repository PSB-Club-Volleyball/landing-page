import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

// A row's secondary actions behind one "more" button, so a table row shows
// its main action and keeps the rest a click away. Closes on outside click,
// Escape, scroll/resize (its fixed position would go stale), or after an
// item runs.
export default function RowMenu({ label, children }: { label: string; children: ReactNode }) {
  const [pos, setPos] = useState<CSSProperties | null>(null)
  const open = pos !== null
  const ref = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const close = () => setPos(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      close()
      // Focus was on the toggle or an item that's about to unmount.
      toggleRef.current?.focus()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <div className="row-menu" ref={ref}>
      <button
        type="button"
        ref={toggleRef}
        className="row-menu-toggle"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          if (open) return close()
          const r = e.currentTarget.getBoundingClientRect()
          // Clamped so a button scrolled partly off-screen still opens
          // on-screen, and flipped upward near the bottom of the viewport.
          const right = Math.max(8, window.innerWidth - r.right)
          setPos(
            window.innerHeight - r.bottom < 180
              ? { bottom: window.innerHeight - r.top + 4, right }
              : { top: r.bottom + 4, right },
          )
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <div className="row-menu-list" style={pos} onClick={close}>
          {children}
        </div>
      )}
    </div>
  )
}
