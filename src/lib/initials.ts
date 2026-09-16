export function initials(name: string | null) {
  const source = name || '?'
  return source
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
