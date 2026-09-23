import { watch, type WatchStopHandle } from 'vue'
import { instantiateTemplate } from '@/domain/effectTemplates'
import { evaluateCondition, type VisualRule } from '@/domain/visualRules'
import { twinBindingTargetKey } from '@/domain/twin'
import type { EffectInstance } from '@/domain/effects'
import type { TwinRuntimeState } from '@/runtime/twin/TwinDataRuntime'
import type { BindingTargetResolver } from '@/internal/BindingTargetResolver'
import type { EffectRuntime } from './EffectRuntime'

export interface RuleDiagnostic {
  status: 'active' | 'inactive' | 'unresolved' | 'disabled' | 'stopped'
  reason?: string
  effects: number
  visibleEffects: number
}
let subscriptions = 0
export function getVisualRuleDiagnostics() { return { subscriptions } }

/** One subscription per scene, no polling; owns only transient instances. */
export class VisualRuleRuntime {
  private stopWatch: WatchStopHandle
  private active = new Map<string, { signature: string; effects: EffectInstance[] }>()
  private output = ''
  private topology = -1
  private disposed = false
  private activations = 0
  private diagnostics: Record<string, RuleDiagnostic> = {}

  constructor(
    private readonly effects: EffectRuntime,
    private readonly state: TwinRuntimeState,
    private readonly resolver: BindingTargetResolver,
    private readonly rules: () => readonly VisualRule[],
    private readonly manual: () => readonly EffectInstance[],
    private readonly revision: () => number = () => 0,
    private readonly publish: (diagnostics: Record<string, RuleDiagnostic>) => void = () => {},
  ) {
    subscriptions++
    this.stopWatch = watch(
      [rules, manual, () => state.runtimeRevision, () => state.bindings, () => state.dataSourceStatus, revision],
      () => this.refresh(), { immediate: true, flush: 'sync' },
    )
  }
  refresh(): void {
    if (this.disposed) return
    const next = new Map<string, { signature: string; effects: EffectInstance[] }>()
    const diagnostics: Record<string, RuleDiagnostic> = {}
    for (const rule of this.rules()) {
      const diagnostic: RuleDiagnostic = { status: 'inactive', effects: 0, visibleEffects: 0 }
      diagnostics[rule.id] = diagnostic
      if (!rule.enabled) { diagnostic.status = 'disabled'; continue }
      if (this.state.dataSourceStatus !== 'connected') { diagnostic.status = 'stopped'; continue }
      const binding = this.state.getBindingById(rule.bindingId)
      const variable = binding?.variables.find(v => v.key === rule.variableKey)
      let reason = ''
      if (!this.resolver.resolve(rule.target)) reason = '目标不存在'
      else if (!binding || twinBindingTargetKey(binding.target) !== twinBindingTargetKey(rule.target)) reason = '设备绑定不存在或不匹配'
      else if (!variable || variable.dataType !== rule.condition.dataType) reason = '变量不存在或类型已变化'
      else if (!rule.template) reason = '缺少模板快照'
      const value = this.state.getRuntimeValue(rule.bindingId, rule.variableKey)?.value
      if (!reason && (value === undefined || typeof value !== rule.condition.dataType || (typeof value === 'number' && !Number.isFinite(value)))) reason = '实时值缺失或类型不匹配'
      if (reason) { diagnostic.status = 'unresolved'; diagnostic.reason = reason; continue }
      if (value === undefined || !evaluateCondition(rule.condition, value) || !rule.template) continue
      const signature = JSON.stringify(rule)
      const previous = this.active.get(rule.id)
      try {
        // Revalidate relative targets when topology changes, without regenerating on every value.
        let entry = previous?.signature === signature ? previous : undefined
        if (entry && !entry.effects.every(e => this.resolver.resolve(e.target))) entry = undefined
        if (!entry) {
          const generated = instantiateTemplate(rule.template, rule.target, target => !!this.resolver.resolve(target))
          generated.forEach((effect, index) => { effect.id = `rule:${rule.id}:${index}` })
          entry = { signature, effects: generated }
          this.activations++
        }
        next.set(rule.id, entry)
        diagnostic.status = 'active'; diagnostic.effects = entry.effects.length
      } catch (e) { diagnostic.status = 'unresolved'; diagnostic.reason = e instanceof Error ? e.message : '模板目标无法解析' }
    }
    this.active = next
    const channel = (e: EffectInstance) => JSON.stringify([twinBindingTargetKey(e.target), e.kind])
    const winners = new Map<string, { effect: EffectInstance; owner?: string }>()
    for (const effect of this.manual()) winners.set(channel(effect), { effect })
    // Ascending priority then descending ID: highest priority / smallest ID wins.
    const ordered = [...this.rules()].sort((a,b) => a.priority - b.priority || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
    for (const rule of ordered) for (const effect of next.get(rule.id)?.effects ?? []) winners.set(channel(effect), { effect, owner: rule.id })
    for (const winner of winners.values()) if (winner.owner) diagnostics[winner.owner]!.visibleEffects++
    const combined = [...winners.values()].map(w => w.effect)
    const output = JSON.stringify(combined)
    if (output !== this.output || this.topology !== this.revision()) {
      this.effects.setEffects(combined)
      this.output = output; this.topology = this.revision()
    }
    if (JSON.stringify(this.diagnostics) !== JSON.stringify(diagnostics)) {
      this.diagnostics = diagnostics; this.publish(diagnostics)
    }
  }
  getDiagnostics() { return { rules: structuredClone(this.diagnostics), activations: this.activations, activeRules: this.active.size } }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true; this.stopWatch(); subscriptions--
    this.active.clear(); this.diagnostics = {}; this.publish({})
    this.effects.setEffects(this.manual())
  }
}
