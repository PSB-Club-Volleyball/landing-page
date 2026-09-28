import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

// A closed <details> keeps its content laid out in Chrome (offsetParent is
// set) but not tabbable; only its own <summary> can take focus.
function inClosedDetails(el: HTMLElement): boolean {
  for (let d = el.closest('details'); d; d = d.parentElement?.closest('details') ?? null) {
    if (!d.open && !(el.tagName === 'SUMMARY' && el.parentElement === d)) return true
  }
  return false
}

// Tabbable descendants of `node` that are actually reachable: skips
// display:none, aria-hidden subtrees, and the inside of a closed <details>.
export function focusableIn(node: HTMLElement): HTMLElement[] {
  return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) =>
      el.tabIndex !== -1 &&
      !el.closest('[aria-hidden="true"]') &&
      !inClosedDetails(el) &&
      (el.offsetParent !== null || el === document.activeElement),
  )
}

/**
 * Wires up the accessibility contract for an open modal dialog:
 * moves focus into the dialog on open (to a `[data-autofocus]` descendant if
 * there is one, else its first control), traps Tab within it, closes on
 * Escape, locks background scroll for as long as it's open, and restores
 * focus to the triggering element on close.
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

    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const previouslyFocused = document.activeElement as HTMLElement | null
    const initial = node.querySelector<HTMLElement>('[data-autofocus]') ?? focusableIn(node)[0] ?? node
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
      // Not on one of the controls: outside the dialog, or on the dialog or
      // its [data-autofocus] target, from which native Shift+Tab would leave.
      const offItems = !active || !items.includes(active)
      if (e.shiftKey && (active === first || offItems)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || offItems)) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previouslyFocused?.focus?.()
    }
  }, [])

  return ref
}
