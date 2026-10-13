// Pasted screenshots and dropped photos become small, self-contained images
// inside the note (a data: URL), so they sync with the Markdown and show up on
// every device with no separate upload step. Big images are scaled down and
// re-encoded first — a Retina screenshot goes from ~4 MB to a few hundred KB.

export const MAX_IMAGE_SIDE = 1600

function hasAlpha(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  // Sample a grid instead of every pixel; screenshots with window shadows still hit.
  const data = ctx.getImageData(0, 0, w, h).data
  const step = Math.max(1, Math.floor((w * h) / 40000)) * 4
  for (let i = 3; i < data.length; i += step) if (data[i] < 250) return true
  return false
}

async function decode(file: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file)
    } catch {
      /* fall through to <img> (older Safari, HEIC) */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

/** Image file → compact data URL, longest side at most `maxSide`. */
export async function imageToDataUrl(file: Blob, maxSide = MAX_IMAGE_SIDE): Promise<string> {
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    // Keep vectors and animations as they are (they're usually small).
    return await new Promise((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(String(r.result))
      r.onerror = () => rej(r.error)
      r.readAsDataURL(file)
    })
  }
  const src = await decode(file)
  const scale = Math.min(1, maxSide / Math.max(src.width, src.height))
  const w = Math.max(1, Math.round(src.width * scale))
  const h = Math.max(1, Math.round(src.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, w, h)
  if ('close' in src && typeof src.close === 'function') src.close()
  const alpha = hasAlpha(ctx, w, h)
  const webp = canvas.toDataURL('image/webp', 0.86)
  if (webp.startsWith('data:image/webp')) return webp
  // Safari can't encode WebP: JPEG for photos, PNG when there's transparency.
  return alpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.86)
}

export function imageFiles(list: FileList | DataTransferItemList | null | undefined): File[] {
  if (!list) return []
  const out: File[] = []
  for (const item of Array.from(list as ArrayLike<File | DataTransferItem>)) {
    const file = item instanceof File ? item : item.kind === 'file' ? item.getAsFile() : null
    if (file && file.type.startsWith('image/')) out.push(file)
  }
  return out
}

export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}
