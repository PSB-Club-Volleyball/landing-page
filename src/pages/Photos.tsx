import { useEffect, useState } from 'react'
import Placeholder from '../components/Placeholder'
import { getMedia, mediaUrl } from '../lib/api'
import type { MediaItem } from '../types'

function Photos() {
  const [media, setMedia] = useState<MediaItem[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    getMedia()
      .then((res) => {
        if (!cancelled) setMedia(res.media)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return <Placeholder title="Photos" note="Couldn't load photos right now &mdash; try refreshing." />
  }

  if (media !== null && media.length === 0) {
    return (
      <Placeholder
        title="Photos"
        note="Photos from practices and tournaments will be posted here once the season gets underway."
      />
    )
  }

  return (
    <main className="board">
      <h2>Photos</h2>
      <ul className="media-grid">
        {(media ?? []).map((item) => (
          <li key={item.id}>
            {item.media_type === 'video' ? (
              <video src={mediaUrl(item.r2_key)} controls preload="metadata" />
            ) : (
              <img src={mediaUrl(item.r2_key)} alt={item.caption ?? ''} loading="lazy" />
            )}
            {item.caption && <span className="media-caption">{item.caption}</span>}
          </li>
        ))}
      </ul>
    </main>
  )
}

export default Photos
