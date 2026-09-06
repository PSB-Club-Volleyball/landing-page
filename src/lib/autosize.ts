import { useLayoutEffect, useRef } from 'react'

// Grows a textarea's height to fit its content instead of scrolling
// internally, re-measuring whenever the controlled value changes (typing,
// but also a programmatic prefill).
export function useAutosizeTextarea(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return ref
}
