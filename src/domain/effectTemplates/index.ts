import { createEffect, createEffectParameters, effectDefinitions, isEffectParameters, type EffectInstance, type EffectKind, type EffectParameters } from '@/domain/effects'
import { twinBindingTargetKey, type TwinBindingTarget } from '@/domain/twin'

export type RelativeEffectTarget =
  | { mode: 'current-target' }
  | { mode: 'root-instance' }
  | { mode: 'asset-node'; assetNodeId: string }
export interface TemplateEffect {
  id: string
  kind: EffectKind
  parameters: EffectParameters
  target: RelativeEffectTarget
}
export interface EffectTemplate {
  version: 1
  id: string
  origin: 'builtin' | 'local'
  name: string
  description: string
  category: string
  effects: TemplateEffect[]
}
export function createTemplateEffect(kind: EffectKind): TemplateEffect {
  return { id: crypto.randomUUID(), kind, parameters: createEffectParameters(), target: { mode: 'current-target' } }
}
export function cloneTemplate(template: EffectTemplate): EffectTemplate {
  return { ...template, effects: template.effects.map(e => ({ ...e, target: { ...e.target }, parameters: { ...e.parameters } })) }
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
export function isEffectTemplate(value: unknown): value is EffectTemplate {
  if (!record(value) || value.version !== 1 || typeof value.id !== 'string' || !value.id) return false
  if (value.origin !== 'builtin' && value.origin !== 'local') return false
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80 || typeof value.description !== 'string' || value.description.length > 500 || typeof value.category !== 'string' || value.category.length > 40) return false
  if (!Array.isArray(value.effects) || !value.effects.length || value.effects.length > 50) return false
  const ids = new Set<string>()
  return value.effects.every(e => {
    if (!record(e) || typeof e.id !== 'string' || !e.id || ids.has(e.id) || !effectDefinitions.some(d => d.kind === e.kind) || !isEffectParameters(e.parameters) || !record(e.target)) return false
    ids.add(e.id)
    // Explicitly exclude concrete scene identities in relative selectors.
    const keys = Object.keys(e.target)
    if (e.target.mode === 'asset-node') return keys.every(k => k === 'mode' || k === 'assetNodeId') && typeof e.target.assetNodeId === 'string' && !!e.target.assetNodeId.trim()
    return keys.length === 1 && (e.target.mode === 'current-target' || e.target.mode === 'root-instance')
  })
}

/** Pure expansion, reusable by a future rule layer; no store, Three, or runtime dependency. */
export function instantiateTemplate(template: EffectTemplate, current: TwinBindingTarget, targetExists: (target: TwinBindingTarget) => boolean): EffectInstance[] {
  if (!isEffectTemplate(template)) throw new Error('模板配置无效：请填写名称并检查特效参数和相对目标')
  const keys = new Set<string>()
  return template.effects.map(atom => {
    let target: TwinBindingTarget
    if (atom.target.mode === 'current-target') target = { ...current }
    else {
      if (current.type === 'primitive') throw new Error('此模板需要模型实例，不能应用到 Primitive')
      target = atom.target.mode === 'root-instance'
        ? { type: 'asset-instance', instanceId: current.instanceId }
        : { type: 'asset-node', instanceId: current.instanceId, assetNodeId: atom.target.assetNodeId }
    }
    if (!targetExists(target)) throw new Error(`模板目标不存在：${target.type === 'asset-node' ? target.assetNodeId : target.type}，未应用任何特效`)
    const key = `${twinBindingTargetKey(target)}|${atom.kind}`
    if (keys.has(key)) throw new Error('模板中存在解析到同一目标的重复类型特效，请调整目标或移除重复项')
    keys.add(key)
    return { ...createEffect(atom.kind, target), parameters: { ...atom.parameters }, sourceTemplateId: template.id }
  })
}
