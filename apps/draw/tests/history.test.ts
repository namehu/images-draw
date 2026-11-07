import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { listArtworks, removeArtwork, saveArtwork } from '../src/lib/history'
import type { Artwork } from '../src/types'
const item = (index: number): Artwork => ({ id: String(index), blob: new Blob(['image']), createdAt: index, model: 'gpt-image-2', prompt: `图像 ${index}`, aspect: 'auto' })
beforeEach(() => removeArtwork())
describe('local history', () => {
  it('keeps quality and complexity while supporting records made before quality selection', async () => {
    await saveArtwork(item(1))
    await saveArtwork({ ...item(2), model: 'gpt-image-2.6-flare', quality: 'high', complexity: 'low' })
    const saved = await listArtworks()
    expect(saved[0]).toMatchObject({ quality: 'high', complexity: 'low' })
    expect(saved[1]).toMatchObject({ quality: 'auto', complexity: 'auto' })
  })
  it('stores only the latest 20 items, newest first', async () => {
    for (let index = 0; index < 22; index++) await saveArtwork(item(index))
    const items = await listArtworks()
    expect(items).toHaveLength(20)
    expect(items[0].id).toBe('21')
    expect(items.at(-1)?.id).toBe('2')
  })
  it('never persists unexpected credential fields', async () => {
    await saveArtwork({ ...item(1), key: 'secret', url: 'blob:transient' } as Artwork)
    expect((await listArtworks())[0]).not.toHaveProperty('key')
    expect((await listArtworks())[0]).not.toHaveProperty('url')
  })
  it('removes a single item without deleting another one', async () => {
    await saveArtwork(item(1)); await saveArtwork(item(2)); await removeArtwork('1')
    expect((await listArtworks()).map(i => i.id)).toEqual(['2'])
  })
  it('bounds stored image bytes and can clear all history', async () => {
    await saveArtwork({ ...item(1), blob: new Blob([new Uint8Array(55 * 1024 * 1024)]) })
    await saveArtwork({ ...item(2), blob: new Blob([new Uint8Array(55 * 1024 * 1024)]) })
    expect((await listArtworks()).map(i => i.id)).toEqual(['2'])
    await removeArtwork(); expect(await listArtworks()).toEqual([])
  })
})
