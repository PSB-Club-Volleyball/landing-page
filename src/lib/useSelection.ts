import { useCallback, useState } from 'react'

// Row-id selection shared by every admin table's batch-select UI. Selection
// is keyed by numeric row id and cleared explicitly (e.g. after a bulk
// action completes) rather than reset on every refresh, so it survives a
// refetch that returns the same rows.
export function useSelection() {
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Selects every id in the list, or clears the selection if all of them
  // are already selected — the usual "header checkbox" behavior.
  const toggleAll = useCallback((ids: number[]) => {
    setSelected((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id))
      return allSelected ? new Set() : new Set(ids)
    })
  }, [])

  const clear = useCallback(() => setSelected(new Set()), [])
  const isSelected = useCallback((id: number) => selected.has(id), [selected])

  return { selected, toggle, toggleAll, clear, isSelected }
}
