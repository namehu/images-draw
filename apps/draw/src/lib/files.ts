export const MAX_UPLOAD = 10 * 1024 * 1024
export async function validateReference(file: File): Promise<void> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('请选择 PNG、JPEG 或 WebP 图片。')
  if (file.size > MAX_UPLOAD) throw new Error('参考图最大为 10 MB，请缩小后再上传。')
  if (!file.size) throw new Error('图片文件为空，请重新选择。')
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('无法读取这张图片，请选择其他图片。') })
  const pixels = bitmap.width * bitmap.height
  bitmap.close()
  if (pixels > 40_000_000) throw new Error('图片分辨率过高，请缩小至 4000 万像素以内。')
}
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = name; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
