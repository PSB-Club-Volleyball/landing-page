import { useEffect, useRef, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import BulkActionBar from '../../components/admin/BulkActionBar'
import { mediaUrl } from '../../lib/api'
import { runBulk, summarizeBulk } from '../../lib/bulk'
import { resizeImageForUpload } from '../../lib/imageResize'
import { useSelection } from '../../lib/useSelection'
import type { AdminEventRow, MediaItem, MediaType } from '../../types'

function MediaAdmin({ isOwner }: { isOwner: boolean }) {
  const [media, setMedia] = useState<MediaItem[]>([])
  const [events, setEvents] = useState<AdminEventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadEventId, setUploadEventId] = useState('')
  const [uploadCaption, setUploadCaption] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const selection = useSelection()
  const [bulkBusy, setBulkBusy] = useState(false)

  function refresh() {
    setLoading(true)
    adminApi.media
      .list()
      .then((res) => setMedia(res.media))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])
  useEffect(() => {
    adminApi.events.list().then((res) => setEvents(res.events)).catch(() => {})
  }, [])

  async function handleFiles(files: FileList) {
    setUploading(true)
    setError(null)
    const eventId = uploadEventId ? Number(uploadEventId) : null
    const result = await runBulk(Array.from(files), async (file) => {
      const mediaType: MediaType = file.type.startsWith('video/') ? 'video' : 'photo'
      const toSend = mediaType === 'photo' ? await resizeImageForUpload(file) : file
      return adminApi.media.upload(toSend, {
        filename: toSend.name,
        mediaType,
        eventId,
        caption: uploadCaption || null,
      })
    })
    setError(summarizeBulk(result, 'Upload'))
    refresh()
    setUploading(false)
  }

  async function updateCaption(item: MediaItem, caption: string) {
    if (caption === (item.caption ?? '')) return
    try {
      await adminApi.media.update(item.id, { caption: caption || null })
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function updateEvent(id: number, eventId: number | null) {
    try {
      await adminApi.media.update(id, { event_id: eventId })
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this photo/video? This can't be undone.")) return
    try {
      await adminApi.media.remove(id)
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleBulkDelete() {
    if (!confirm(`Delete ${selection.selected.size} item(s)? This can't be undone.`)) return
    setBulkBusy(true)
    const result = await runBulk([...selection.selected], (id) => adminApi.media.remove(id))
    setError(summarizeBulk(result, 'Bulk delete'))
    selection.clear()
    refresh()
    setBulkBusy(false)
  }

  return (
    <>
      <div className="admin-main-head">
        <h2>Media</h2>
      </div>
      <p className="admin-note">
        Upload photos and videos for the public Photos page &mdash; optionally tag a batch to an event/album.
      </p>
      {error && <p className="admin-error">{error}</p>}

      <div className="media-upload-bar">
        <label className="field">
          Add to event <span className="field-hint">(optional)</span>
          <select value={uploadEventId} onChange={(e) => setUploadEventId(e.target.value)}>
            <option value="">No event</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Caption <span className="field-hint">(applies to this upload, optional)</span>
          <input
            value={uploadCaption}
            onChange={(e) => setUploadCaption(e.target.value)}
            placeholder="e.g. Fall tournament, day 1"
          />
        </label>
        <button
          className="btn btn-ace"
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? 'Uploading…' : '+ Upload photos/videos'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(e) => {
            const files = e.target.files
            e.target.value = ''
            if (files && files.length > 0) handleFiles(files)
          }}
        />
      </div>

      {media.length > 0 && (
        <button type="button" className="link-btn media-select-all" onClick={() => selection.toggleAll(media.map((m) => m.id))}>
          {media.every((m) => selection.isSelected(m.id)) ? 'Deselect all' : 'Select all'}
        </button>
      )}
      <BulkActionBar count={selection.selected.size} onClear={selection.clear}>
        {isOwner && (
          <button type="button" className="danger" disabled={bulkBusy} onClick={handleBulkDelete}>
            Delete selected
          </button>
        )}
      </BulkActionBar>

      {loading && <p className="admin-note">Loading&hellip;</p>}
      {!loading && media.length === 0 && <p className="admin-note">No photos or videos yet.</p>}
      {!loading && media.length > 0 && (
        <ul className="media-admin-grid">
          {media.map((item) => (
            <li key={item.id} className="media-admin-item">
              <label className="media-admin-select">
                <input type="checkbox" checked={selection.isSelected(item.id)} onChange={() => selection.toggle(item.id)} />
                Select
              </label>
              {item.media_type === 'video' ? (
                <video src={mediaUrl(item.r2_key)} controls preload="metadata" />
              ) : (
                <img src={mediaUrl(item.r2_key)} alt={item.caption ?? ''} loading="lazy" />
              )}
              <input
                className="media-admin-caption"
                placeholder="Caption"
                defaultValue={item.caption ?? ''}
                onBlur={(e) => updateCaption(item, e.target.value)}
              />
              <select
                className="media-admin-event"
                value={item.event_id ?? ''}
                onChange={(e) => updateEvent(item.id, e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">No event</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title}
                  </option>
                ))}
              </select>
              {isOwner && (
                <button type="button" className="danger media-admin-delete" onClick={() => handleDelete(item.id)}>
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export default MediaAdmin
