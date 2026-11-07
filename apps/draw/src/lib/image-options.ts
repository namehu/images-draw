import type { ImageComplexity, ImageQuality } from '../types'

export const qualityLabels: Record<ImageQuality, string> = { auto: '自动', low: '低', medium: '中', high: '高', xhigh: '超高', max: '最高' }
export const complexityLabels: Record<ImageComplexity, string> = { auto: '模型默认', low: '低', medium: '中', high: '高' }

// Sub2API forwards the extended quality levels for the Image 2 family.
// Older models retain the standard quality choices.
export function allowedQualities(model: string): ImageQuality[] {
  return /^gpt-image-2(?:\.(?:5|6))?(?:-|$)/i.test(model)
    ? ['auto', 'low', 'medium', 'high', 'xhigh', 'max']
    : ['auto', 'low', 'medium', 'high']
}

export function supportsComplexity(model: string): boolean {
  return /^gpt-image-2\.6-(?:flare|sunburst)(?:-|$)/i.test(model)
}
