import { cloneTemplate, isEffectTemplate, type EffectTemplate } from '@/domain/effectTemplates'
import { isTwinBindingTarget, type TwinBindingTarget, type TwinRuntimeValueData } from '@/domain/twin'

export type RuleOperator = '>' | '>=' | '<' | '<=' | '==' | '!='
export type RuleCondition =
  | { dataType: 'number'; operator: RuleOperator; value: number }
  | { dataType: 'boolean'; operator: '==' | '!='; value: boolean }
  | { dataType: 'string'; operator: '==' | '!='; value: string }
export interface VisualRule {
  id: string
  bindingId: string
  target: TwinBindingTarget
  variableKey: string
  condition: RuleCondition
  enabled: boolean
  priority: number
  /** Saved recipe: source repository is not required at runtime. null = unresolved. */
  template: EffectTemplate | null
}
export function ruleOperators(type: RuleCondition['dataType']): RuleOperator[] {
  return type === 'number' ? ['>', '>=', '<', '<=', '==', '!='] : ['==', '!=']
}
export function isVisualRule(value: unknown): value is VisualRule {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  if (typeof r.id !== 'string' || !r.id || typeof r.bindingId !== 'string' || !r.bindingId || !isTwinBindingTarget(r.target) || typeof r.variableKey !== 'string' || !r.variableKey || typeof r.enabled !== 'boolean' || typeof r.priority !== 'number' || !Number.isInteger(r.priority) || r.priority < 0 || r.priority > 100) return false
  if (r.template !== null && !isEffectTemplate(r.template)) return false
  if (!r.condition || typeof r.condition !== 'object') return false
  const c = r.condition as Record<string, unknown>
  if (c.dataType !== 'number' && c.dataType !== 'boolean' && c.dataType !== 'string') return false
  return ruleOperators(c.dataType).some(op => op === c.operator) && typeof c.value === c.dataType && (c.dataType !== 'number' || Number.isFinite(c.value))
}
export function cloneRules(rules: readonly VisualRule[]): VisualRule[] {
  return rules.map(r => ({ ...r, target: { ...r.target }, condition: { ...r.condition }, template: r.template ? cloneTemplate(r.template) : null }))
}
/** No coercion, eval, or expressions. Invalid runtime values never satisfy != either. */
export function evaluateCondition(condition: RuleCondition, value: TwinRuntimeValueData): boolean {
  if (typeof value !== condition.dataType || (typeof value === 'number' && !Number.isFinite(value))) return false
  if (condition.operator === '==') return value === condition.value
  if (condition.operator === '!=') return value !== condition.value
  if (condition.dataType !== 'number' || typeof value !== 'number') return false
  switch (condition.operator) {
    case '>': return value > condition.value
    case '>=': return value >= condition.value
    case '<': return value < condition.value
    case '<=': return value <= condition.value
  }
}
