export type Aspect = 'auto' | '1:1' | '2:3' | '3:2' | '16:9' | '9:16'
export type ImageQuality = 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type ImageComplexity = 'auto' | 'low' | 'medium' | 'high'
export interface Template { id: string; title: string; description: string; prompt: string; color: string; aspect: Aspect }
export interface Artwork { id: string; blob: Blob; prompt: string; model: string; aspect: Aspect; quality?: ImageQuality; complexity?: ImageComplexity; createdAt: number; persisted?: boolean }
export interface DisplayArtwork extends Artwork { url: string }
export interface GenerationOptions { key: string; prompt: string; model: string; aspect: Aspect; quality?: ImageQuality; complexity?: ImageComplexity; reference?: File; signal: AbortSignal; onPreview?: (blob: Blob) => void }
