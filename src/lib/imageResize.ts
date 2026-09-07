// Downscales a photo before it goes to R2 — see the storage-budget note in
// functions/api/admin/media/upload.ts (~300KB/photo keeps the free tier
// huge). Videos pass through untouched; this only handles images.
export async function resizeImageForUpload(
  file: File,
  { maxDimension = 1600, quality = 0.82 }: { maxDimension?: number; quality?: number } = {}
): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  if (scale === 1) {
    bitmap.close()
    return file
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return file
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) return file

  const newName = file.name.replace(/\.\w+$/, '') + '.jpg'
  return new File([blob], newName, { type: 'image/jpeg' })
}
