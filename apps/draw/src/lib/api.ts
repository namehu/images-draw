import type { Aspect, GenerationOptions } from '../types'
import { allowedQualities, supportsComplexity } from './image-options'

const MAX_RESPONSE_BYTES = 80 * 1024 * 1024
const SIZE: Record<Aspect, string> = { auto: 'auto', '1:1': '1024x1024', '2:3': '1024x1536', '3:2': '1536x1024', '16:9': '1536x864', '9:16': '864x1536' }
type Json = Record<string, any>

export function friendlyError(error: unknown, key = ''): string {
  let message = error instanceof Error ? error.message : '暂时无法完成，请稍后再试。'
  if (key) message = message.split(key).join('[已隐藏]')
  return message.replace(/Bearer\s+\S+/gi, 'Bearer [已隐藏]').replace(/sk-[\w-]+/gi, '[已隐藏]').slice(0, 260)
}

function apiError(body: Json, status: number): Error {
  const error = body.error ?? body
  const code = String(error.code ?? error.type ?? '')
  if (status === 401) return new Error('API Key 无效或已过期，请重新连接。')
  if (status === 402 || /insufficient|balance|quota_exceeded/i.test(code)) return new Error('额度不足，请到平台检查余额或套餐。')
  if (status === 403) return new Error('这枚 Key 暂无图片权限，请检查所属分组。')
  if (status === 413) return new Error('上传图片过大，请选择较小的图片。')
  if (status === 429) return new Error('当前请求较多或并发已满，请稍后手动重试。')
  if (status >= 500) return new Error('图片服务暂时不可用。请稍后查看用量记录，再决定是否重试。')
  return new Error(typeof error.message === 'string' ? error.message : '未能生成图像，请检查模型与请求参数。')
}

async function readJson(response: Response): Promise<Json> {
  if (!response.body) throw new Error('服务返回了空响应。')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = '', bytes = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_RESPONSE_BYTES) throw new Error('返回的图片过大，请使用较小尺寸重新生成。')
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    try { return JSON.parse(text) } catch { throw new Error('服务返回格式异常。请检查用量后再决定是否重试。') }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}

export async function loadModels(key: string, signal?: AbortSignal): Promise<string[]> {
  const response = await fetch('/v1/models', { headers: { Authorization: `Bearer ${key}` }, signal, cache: 'no-store', credentials: 'omit', redirect: 'error' })
  const data = await readJson(response)
  if (!response.ok || data.error) throw apiError(data, response.status)
  const models = [...new Set<string>((Array.isArray(data.data) ? data.data : []).map((m: Json) => m.id).filter((m: unknown): m is string => typeof m === 'string' && /^gpt-image-/i.test(m)))].sort()
  if (!models.length) throw new Error('这枚 Key 没有可用的 GPT Image 模型，请在平台检查分组与模型权限。')
  return models
}

/** Streaming decoder handles UTF-8 boundaries, CR/LF, comments and multi-line data. */
export async function* parseSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = stream.getReader(), decoder = new TextDecoder()
  let buffer = '', event = '', data: string[] = [], bytes = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) buffer += decoder.decode()
      else {
        bytes += chunk.value.byteLength
        if (bytes > MAX_RESPONSE_BYTES) throw new Error('返回的图片过大，请使用较小尺寸。')
        buffer += decoder.decode(chunk.value, { stream: true })
      }
      let newline: number
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '')
        buffer = buffer.slice(newline + 1)
        if (line === '') {
          if (data.length) yield { event, data: data.join('\n') }
          event = ''; data = []
        } else if (!line.startsWith(':')) {
          const colon = line.indexOf(':')
          const field = colon < 0 ? line : line.slice(0, colon)
          const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
          if (field === 'event') event = value
          if (field === 'data') data.push(value)
        }
      }
      if (chunk.done) break
    }
    // A truncated event must never be treated as a completed image.
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}

function mime(format?: string): string { return format === 'jpeg' || format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png' }

export function base64Blob(value: string, type = 'image/png'): Blob {
  try {
    const bytes = atob(value)
    const data = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) data[i] = bytes.charCodeAt(i)
    if (!data.length) throw new Error('empty')
    return new Blob([data], { type })
  } catch { throw new Error('图片数据不完整，请检查用量后再决定是否重试。') }
}

async function imageBlob(payload: Json, signal?: AbortSignal): Promise<Blob | undefined> {
  if (typeof payload.b64_json === 'string' && payload.b64_json) return base64Blob(payload.b64_json, mime(payload.output_format))
  if (typeof payload.url !== 'string') return
  const data = payload.url.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s)
  if (data) return base64Blob(data[2], data[1])
  const url = new URL(payload.url, location.origin)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('服务返回的图片链接不安全，未打开。')
  const response = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' })
  if (!response.ok || !/^image\/(png|jpeg|webp)\b/.test(response.headers.get('Content-Type') ?? '')) throw new Error('图片已生成，但下载链接暂时不可用。')
  const blob = await response.blob()
  if (blob.size > MAX_RESPONSE_BYTES) throw new Error('返回的图片过大。')
  return blob
}

export async function consumeImageResponse(response: Response, signal?: AbortSignal, onPreview?: (blob: Blob) => void): Promise<Blob> {
  if (!response.ok) {
    let body = {}
    try { body = await readJson(response) } catch { /* Gateways may return HTML error pages. */ }
    throw apiError(body, response.status)
  }
  if (!response.ok || !response.headers.get('Content-Type')?.includes('text/event-stream')) {
    const data = await readJson(response)
    if (!response.ok || data.error) throw apiError(data, response.status)
    const blob = await imageBlob(data.data?.[0] ?? data, signal)
    if (!blob) throw new Error('服务没有返回图片，请检查用量后再决定是否重试。')
    return blob
  }
  if (!response.body) throw new Error('服务返回了空响应。')
  let result: Blob | undefined
  for await (const event of parseSse(response.body)) {
    if (event.data.trim() === '[DONE]') break
    let payload: Json
    try { payload = JSON.parse(event.data) } catch { throw new Error('生成数据不完整，请检查用量后再决定是否重试。') }
    const type = payload.type || event.event
    if (type === 'error' || payload.error || type === 'response.failed') throw apiError(payload, 200)
    if (/^image_(generation|edit)\.partial_image$/.test(type)) {
      const preview = await imageBlob(payload, signal)
      if (preview) onPreview?.(preview)
    }
    if (/^image_(generation|edit)\.completed$/.test(type)) result = await imageBlob(payload, signal)
  }
  if (!result) throw new Error('连接已结束，但没有收到完整图片。上游可能仍在处理，请先查看用量记录。')
  return result
}

export async function generateImage(options: GenerationOptions): Promise<Blob> {
  const { key, prompt, model, aspect, quality = 'auto', complexity = 'auto', reference, signal, onPreview } = options
  if (!allowedQualities(model).includes(quality)) throw new Error('当前模型不支持这个质量档位，请重新选择。')
  // Keep the verified JSON edit path. Sub2API 0.2.20 adds a streamed-JSON
  // fallback, but streaming edits still need a separate live regression check.
  const stream = !reference
  const fields = { model, prompt: prompt.trim(), size: SIZE[aspect], quality, ...(supportsComplexity(model) && complexity !== 'auto' ? { complexity } : {}), output_format: 'png', response_format: 'b64_json', n: 1, stream }
  const headers: Record<string, string> = { Authorization: `Bearer ${key}`, Accept: stream ? 'text/event-stream' : 'application/json' }
  let body: BodyInit
  if (reference) {
    const form = new FormData()
    Object.entries(fields).forEach(([name, value]) => form.set(name, String(value)))
    form.set('image', reference, reference.name)
    body = form
  } else { headers['Content-Type'] = 'application/json'; body = JSON.stringify(fields) }
  const response = await fetch(reference ? '/v1/images/edits' : '/v1/images/generations', { method: 'POST', headers, body, signal, credentials: 'omit', redirect: 'error', cache: 'no-store' })
  return consumeImageResponse(response, signal, onPreview)
}

export function allowedAspects(model: string): Aspect[] {
  return /^gpt-image-(2|2\.5)(?:[-.]|$)/i.test(model) ? ['auto', '1:1', '2:3', '3:2', '16:9', '9:16'] : ['auto', '1:1', '2:3', '3:2']
}
