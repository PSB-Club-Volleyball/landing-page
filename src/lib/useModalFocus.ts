import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

function focusableIn(node: HTMLElement): HTMLElement[] {
  return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) =>
      el.tabIndex !== -1 &&
      !el.closest('[aria-hidden="true"]') &&
      (el.offsetParent !== null || el === document.activeElement),
  )
}

/**
 * Wires up the accessibility contract for an open modal dialog:
 * moves focus into the dialog on open, traps Tab within it, closes on
 * Escape, and restores focus to the triggering element on close.
 *
 * Attach the returned ref to the dialog container (the element carrying
 * `role="dialog"` or its immediate panel).
 */
export function useModalFocus<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null)
  // Call sites pass a fresh arrow each render; keep it in a ref so a parent
  // re-render while the modal is open doesn't tear the effect down (which
  // would yank focus back and lose the restore target).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const initial = focusableIn(node)[0] ?? node
    initial.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !node) return
      const items = focusableIn(node)
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement as HTMLElement | null
      const outside = !active || (active !== node && !node.contains(active))
      if (e.shiftKey && (active === first || active === node || outside)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || outside)) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [])

  return ref
}
