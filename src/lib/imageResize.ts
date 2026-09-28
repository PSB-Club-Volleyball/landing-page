// Downscales a photo before it goes to R2 — see the storage-budget note in
// functions/api/admin/media/upload.ts (~300KB/photo keeps the free tier
// huge) — and turns HEIC into JPEG, since only Safari can display HEIC.
// Videos pass through untouched; this only handles images.
export async function resizeImageForUpload(
  file: File,
  { maxDimension = 1600, quality = 0.82 }: { maxDimension?: number; quality?: number } = {}
): Promise<File> {
  const heic = isHeicFile(file)
  if (!heic && (!file.type.startsWith('image/') || file.type === 'image/gif')) return file

  const bitmap = await decodeImage(file, heic)
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && !heic) {
    bitmap.close()
    return file
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    if (heic) throw new Error(`Couldn't convert ${file.name}: no canvas context`)
    return file
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) {
    if (heic) throw new Error(`Couldn't convert ${file.name}: JPEG encode failed`)
    return file
  }

  const newName = file.name.replace(/\.\w+$/, '') + '.jpg'
  return new File([blob], newName, { type: 'image/jpeg' })
}

// iPhone photos are HEIC. Some browsers leave file.type empty for .heic, so
// check the extension too.
function isHeicFile(file: File): boolean {
  return /^image\/hei[cf]$/.test(file.type) || /\.hei[cf]$/i.test(file.name)
}

// Safari decodes HEIC natively; Chrome/Firefox throw, so fall back to the
// heic-to decoder (a ~3MB bundle with embedded wasm), imported only then.
async function decodeImage(file: File, heic: boolean): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file)
  } catch (e) {
    if (!heic) throw e
  }
  const { heicTo } = await import('heic-to')
  try {
    return await heicTo({ blob: file, type: 'bitmap' })
  } catch (e) {
    // heic-to rejects with a plain string, not an Error
    throw new Error(`Couldn't read ${file.name} as HEIC: ${String(e)}`)
  }
}
