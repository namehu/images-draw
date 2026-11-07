import { describe, expect, it } from 'vitest'
import { allowedAspects, consumeImageResponse, friendlyError, parseSse } from '../src/lib/api'

function stream(text: string, chunkSize = 1) {
  const bytes = new TextEncoder().encode(text)
  return new ReadableStream<Uint8Array>({ start(controller) { for (let index = 0; index < bytes.length; index += chunkSize) controller.enqueue(bytes.slice(index, index + chunkSize)); controller.close() } })
}
function sse(text: string) { return new Response(stream(text), { headers: { 'Content-Type': 'text/event-stream' } }) }

describe('streaming image transport', () => {
  it('reassembles UTF-8, CRLF, heartbeats and multiline events across byte boundaries', async () => {
    const events = []
    for await (const item of parseSse(stream(': keepalive\r\n\r\nevent: notice\r\ndata: {"message":\r\ndata: "你好"}\r\n\r\n'))) events.push(item)
    expect(events).toEqual([{ event: 'notice', data: '{"message":\n"你好"}' }])
  })
  it.each(['image_generation', 'image_edit'])('reads %s completion after previews and comments', async (prefix) => {
    const previews: Blob[] = []
    const result = await consumeImageResponse(sse(`:\n\nevent: ${prefix}.partial_image\ndata: {"b64_json":"cHJldmlldw=="}\n\ndata: {"type":"${prefix}.completed","b64_json":"ZmluYWw="}\n\ndata: [DONE]\n\n`), undefined, blob => previews.push(blob))
    expect(await result.text()).toBe('final')
    expect(await previews[0].text()).toBe('preview')
  })
  it('rejects HTTP 200 error events after a partial image', async () => {
    await expect(consumeImageResponse(sse('data: {"type":"image_generation.partial_image","b64_json":"YQ=="}\n\nevent: error\ndata: {"error":{"message":"No image permission"}}\n\n'))).rejects.toThrow('No image permission')
  })
  it('does not mistake a truncated completion for success', async () => {
    await expect(consumeImageResponse(sse('data: {"type":"image_generation.completed","b64_json":"YQ=="}'))).rejects.toThrow('没有收到完整图片')
  })
  it('rejects completed streams without an image', async () => {
    await expect(consumeImageResponse(sse('data: [DONE]\n\n'))).rejects.toThrow('没有收到完整图片')
  })
  it('accepts JSON with leading whitespace heartbeats', async () => {
    const response = new Response(' \n \n{"data":[{"b64_json":"cGljdHVyZQ=="}]}', { headers: { 'Content-Type': 'application/json' } })
    expect(await (await consumeImageResponse(response)).text()).toBe('picture')
  })
  it('rejects an error object inside an HTTP 200 JSON response', async () => {
    await expect(consumeImageResponse(new Response('{"error":{"message":"bad model"}}'))).rejects.toThrow('bad model')
  })
  it('gives a useful authentication error', async () => {
    await expect(consumeImageResponse(new Response('{"error":{}}', { status: 401 }))).rejects.toThrow('API Key 无效')
  })
  it('handles an HTML gateway failure without showing a misleading JSON error', async () => {
    await expect(consumeImageResponse(new Response('<html>Bad Gateway</html>', { status: 502 }))).rejects.toThrow('图片服务暂时不可用')
  })
  it('hides credentials in unexpected upstream messages', () => {
    expect(friendlyError(new Error('token secret-value sk-test-secret'), 'secret-value')).not.toMatch(/secret-value|sk-test-secret/)
  })
  it('limits legacy models to supported aspect ratios', () => {
    expect(allowedAspects('gpt-image-1.5')).not.toContain('16:9')
    expect(allowedAspects('gpt-image-2.5-flare')).toContain('16:9')
  })
})
