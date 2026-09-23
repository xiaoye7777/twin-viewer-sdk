import { isTwinBindingTarget, type TwinBindingTarget } from '@/domain/twin'

export type EffectKind = 'box-glow' | 'ground-pulse' | 'outline' | 'child-highlight' | 'floating-label'
export interface EffectParameters {
  color: string
  opacity: number
  speed: number
  padding: number
  text: string
}
export interface EffectInstance {
  id: string
  kind: EffectKind
  target: TwinBindingTarget
  parameters: EffectParameters
  /** Provenance only: never resolved by the runtime or automatically synchronized. */
  sourceTemplateId?: string
}
export interface EffectDefinition {
  kind: EffectKind
  name: string
  category: '告警' | '高亮' | '标注'
  fields: readonly (keyof EffectParameters)[]
}
export const effectDefinitions: readonly EffectDefinition[] = [
  { kind: 'box-glow', name: '呼吸光框', category: '告警', fields: ['color', 'opacity', 'speed', 'padding'] },
  { kind: 'ground-pulse', name: '地面脉冲', category: '告警', fields: ['color', 'opacity', 'speed', 'padding'] },
  { kind: 'outline', name: 'Outline 描边', category: '高亮', fields: [] },
  { kind: 'child-highlight', name: '局部高亮', category: '高亮', fields: ['color', 'opacity'] },
  { kind: 'floating-label', name: '悬浮标注', category: '标注', fields: ['color', 'opacity', 'padding', 'text'] },
]
export function createEffect(kind: EffectKind, target: TwinBindingTarget): EffectInstance {
  return {
    id: `effect_${crypto.randomUUID()}`, kind, target: { ...target },
    parameters: createEffectParameters(),
  }
}
export function createEffectParameters(): EffectParameters {
  return { color: '#ffb020', opacity: 0.65, speed: 1, padding: 0.2, text: '设备标注' }
}
export function cloneEffects(effects: readonly EffectInstance[]): EffectInstance[] {
  return effects.map(effect => ({ ...effect, target: { ...effect.target }, parameters: { ...effect.parameters } }))
}
export function isEffectInstance(value: unknown): value is EffectInstance {
  if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string' || !value.id) return false
  if (!('kind' in value) || !effectDefinitions.some(def => def.kind === value.kind)) return false
  if (!('target' in value) || !isTwinBindingTarget(value.target) || !('parameters' in value)) return false
  if ('sourceTemplateId' in value && (typeof value.sourceTemplateId !== 'string' || !value.sourceTemplateId)) return false
  return isEffectParameters(value.parameters)
}
export function isEffectParameters(p: unknown): p is EffectParameters {
  if (!p || typeof p !== 'object') return false
  return 'color' in p && typeof p.color === 'string' && /^#[0-9a-f]{6}$/i.test(p.color) &&
    'opacity' in p && typeof p.opacity === 'number' && Number.isFinite(p.opacity) && p.opacity >= 0 && p.opacity <= 1 &&
    'speed' in p && typeof p.speed === 'number' && Number.isFinite(p.speed) && p.speed >= 0 && p.speed <= 10 &&
    'padding' in p && typeof p.padding === 'number' && Number.isFinite(p.padding) && p.padding >= 0 && p.padding <= 100 &&
    'text' in p && typeof p.text === 'string' && p.text.length <= 200
}
