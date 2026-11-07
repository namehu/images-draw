import type { Artwork } from '../types'
const DATABASE = 'image-draw-v1'
const STORE = 'artworks'
const MAX_COUNT = 20
const MAX_BYTES = 100 * 1024 * 1024

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('浏览器不支持本机存储。'))
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('请关闭其他绘图标签页后重试。'))
  })
}

export async function listArtworks(): Promise<Artwork[]> {
  const db = await open()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readonly')
      const request = transaction.objectStore(STORE).getAll()
      request.onsuccess = () => resolve((request.result as Artwork[]).sort((a, b) => b.createdAt - a.createdAt))
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}

export async function saveArtwork(artwork: Artwork): Promise<void> {
  if (artwork.blob.size > MAX_BYTES) throw new Error('图片超过本机历史容量，请直接下载保存。')
  const db = await open()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite')
      const store = transaction.objectStore(STORE)
      const request = store.getAll()
      request.onsuccess = () => {
        const old = (request.result as Artwork[]).filter(a => a.id !== artwork.id).sort((a, b) => b.createdAt - a.createdAt)
        let bytes = artwork.blob.size, count = 1
        for (const item of old) {
          if (count >= MAX_COUNT || bytes + item.blob.size > MAX_BYTES) store.delete(item.id)
          else { count++; bytes += item.blob.size }
        }
        // Write explicit fields so credentials and transient object URLs never reach IndexedDB.
        store.put({ id: artwork.id, blob: artwork.blob, prompt: artwork.prompt, model: artwork.model, aspect: artwork.aspect, quality: artwork.quality ?? 'auto', complexity: artwork.complexity ?? 'auto', createdAt: artwork.createdAt })
      }
      transaction.oncomplete = () => resolve()
      transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('本机存储失败，请直接下载保存。'))
    })
  } finally { db.close() }
}

export async function removeArtwork(id?: string): Promise<void> {
  const db = await open()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      if (id) tx.objectStore(STORE).delete(id); else tx.objectStore(STORE).clear()
      tx.oncomplete = () => resolve()
      tx.onabort = tx.onerror = () => reject(tx.error)
    })
  } finally { db.close() }
}
