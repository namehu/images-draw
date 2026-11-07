import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateImage, loadModels } from '../src/lib/api'
import { allowedQualities, supportsComplexity } from '../src/lib/image-options'
import type { GenerationOptions, ImageQuality } from '../src/types'

afterEach(() => vi.unstubAllGlobals())

const defaults: GenerationOptions = { key: 'mock-key', prompt: ' a lemon ', model: 'gpt-image-2.6-flare', aspect: '1:1', signal: new AbortController().signal }
const qualities: ImageQuality[] = ['auto', 'low', 'medium', 'high', 'xhigh', 'max']

async function request(options: Partial<GenerationOptions>) {
  const fetchMock = vi.fn().mockResolvedValue(new Response('{"data":[{"b64_json":"aW1hZ2U="}]}', { headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', fetchMock)
  await generateImage({ ...defaults, ...options })
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  const fields = init.body instanceof FormData ? Object.fromEntries(init.body.entries()) : JSON.parse(String(init.body))
  return { url, init, fields }
}

describe('image quality request contract', () => {
  it.each(qualities)('sends selected %s quality in JSON generation', async quality => {
    const { url, fields } = await request({ quality })
    expect(url).toBe('/v1/images/generations')
    expect(fields).toMatchObject({ quality, prompt: 'a lemon', size: '1024x1024', stream: true, output_format: 'png', n: 1 })
    expect(fields).not.toHaveProperty('complexity')
  })
  it.each(qualities)('sends selected %s quality in multipart editing', async quality => {
    const reference = new File(['reference-bytes'], 'reference.png', { type: 'image/png' })
    const { url, init, fields } = await request({ quality, reference })
    expect(url).toBe('/v1/images/edits')
    expect(fields).toMatchObject({ quality, stream: 'false', size: '1024x1024', output_format: 'png' })
    expect(await (fields.image as File).text()).toBe('reference-bytes')
    expect(init.headers).toMatchObject({ Accept: 'application/json' })
    expect(init.headers).not.toHaveProperty('Content-Type')
    expect(fields).not.toHaveProperty('complexity')
  })
  it.each(['gpt-image-2.6-flare', 'gpt-image-2.6-sunburst'])('preserves explicit complexity independently for %s', async model => {
    for (const reference of [undefined, new File(['image'], 'input.png')]) {
      const { fields } = await request({ model, quality: 'high', complexity: 'low', reference })
      expect(fields).toMatchObject({ model, quality: 'high', complexity: 'low' })
    }
  })
  it('omits complexity for older models and keeps default quality automatic', async () => {
    expect((await request({ model: 'gpt-image-2.5-flare', complexity: 'high' })).fields).not.toHaveProperty('complexity')
    expect((await request({})).fields.quality).toBe('auto')
  })
  it('does not send a stale unsupported quality to an older model', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(generateImage({ ...defaults, model: 'gpt-image-1.5', quality: 'max' })).rejects.toThrow('质量档位')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(allowedQualities('gpt-image-1.5')).toEqual(['auto', 'low', 'medium', 'high'])
    expect(supportsComplexity('gpt-image-2.5-flare')).toBe(false)
  })
  it('shows only image models returned for the key, including 2.6 when granted', async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'gpt-image-2' }, { id: 'gpt-image-2.6-flare' }, { id: 'gpt-image-2.6-sunburst' }, { id: 'gpt-image-2.6-flare' }, { id: 'text-model' }] })))
      .mockResolvedValueOnce(new Response('{"data":[{"id":"gpt-image-2"}]}'))
    vi.stubGlobal('fetch', mock)
    expect(await loadModels('mock-key')).toEqual(['gpt-image-2', 'gpt-image-2.6-flare', 'gpt-image-2.6-sunburst'])
    expect(await loadModels('mock-key')).toEqual(['gpt-image-2'])
  })
})
