import { useEffect, useState } from 'react'
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

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="board">
        <h1>Photos</h1>
        {error && (
          <p className="placeholder-note">
            Couldn&rsquo;t load photos right now &mdash; try refreshing.
          </p>
        )}
        {!error && media !== null && media.length === 0 && (
          <p className="placeholder-note">
            Photos from practices and tournaments will be posted here once the season gets
            underway.
          </p>
        )}
        {media !== null && media.length > 0 && (
          <ul className="media-grid">
            {media.map((item) => (
              <li key={item.id}>
                {item.media_type === 'video' ? (
                  <video src={mediaUrl(item.r2_key)} controls preload="metadata" />
                ) : (
                  <img
                    src={mediaUrl(item.r2_key)}
                    alt={item.caption || 'Behrend Club Volleyball photo'}
                    loading="lazy"
                  />
                )}
                {item.caption && <span className="media-caption">{item.caption}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}

export default Photos
