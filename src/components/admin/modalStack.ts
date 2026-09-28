import { useEffect, useRef } from 'react'

// Open admin dialogs, oldest first. Modals can stack (the form builder opens
// a preview on top of itself), and every one listens on `document`, so only
// the last-opened one may act on Escape — otherwise one keypress closes the
// preview *and* the builder underneath, discarding the draft.
const stack: symbol[] = []

export function useTopmostEscape(onEscape: () => void) {
  // Call sites pass a fresh arrow each render; keep the latest in a ref so the
  // listener (and the modal's place in the stack) survives parent re-renders.
  const onEscapeRef = useRef(onEscape)
  useEffect(() => {
    onEscapeRef.current = onEscape
  })

  useEffect(() => {
    const token = Symbol('modal')
    stack.push(token)
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || stack[stack.length - 1] !== token) return
      e.preventDefault()
      onEscapeRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      stack.splice(stack.indexOf(token), 1)
    }
  }, [])
}
