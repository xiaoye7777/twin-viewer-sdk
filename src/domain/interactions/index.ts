import { isTwinBindingTarget, type TwinBindingTarget } from '@/domain/twin'

export type InteractionTrigger = 'click' | 'double-click' | 'hover-enter' | 'hover-leave'
export type InteractionMetadataValue = string | number | boolean | null | InteractionMetadataValue[] | { [key: string]: InteractionMetadataValue }
export type InteractionMetadata = Record<string, InteractionMetadataValue>

export type InteractionAction =
  | { type: 'select'; target?: TwinBindingTarget }
  | { type: 'clear-selection' }
  | { type: 'focus'; target?: TwinBindingTarget }
  | { type: 'emit-event'; eventName: string; metadata?: InteractionMetadata }
  | { type: 'show'; target?: TwinBindingTarget }
  | { type: 'hide'; target?: TwinBindingTarget }
  | { type: 'highlight'; target?: TwinBindingTarget }

export interface SceneInteraction {
  id: string
  enabled: boolean
  source: TwinBindingTarget
  trigger: InteractionTrigger
  action: InteractionAction
}

export const interactionTriggers: readonly InteractionTrigger[] = ['click', 'double-click', 'hover-enter', 'hover-leave']
export const interactionActionTypes = ['select', 'clear-selection', 'focus', 'emit-event', 'show', 'hide', 'highlight'] as const
export type InteractionActionType = typeof interactionActionTypes[number]

export function createInteraction(source: TwinBindingTarget): SceneInteraction {
  return { id: `interaction_${crypto.randomUUID()}`, enabled: true, source: { ...source }, trigger: 'click', action: { type: 'select' } }
}

export function cloneInteractions(values: readonly SceneInteraction[]): SceneInteraction[] {
  return values.map(value => ({
    ...value,
    source: { ...value.source },
    action: {
      ...value.action,
      ...('target' in value.action && value.action.target ? { target: { ...value.action.target } } : {}),
      ...(value.action.type === 'emit-event' && value.action.metadata ? { metadata: structuredClone(value.action.metadata) } : {}),
    } as InteractionAction,
  }))
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function isJsonValue(value: unknown, depth = 0): value is InteractionMetadataValue {
  if (depth > 10) return false
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(item => isJsonValue(item, depth + 1))
  return isRecord(value) && Object.values(value).every(item => isJsonValue(item, depth + 1))
}

export function isSceneInteraction(value: unknown): value is SceneInteraction {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id || typeof value.enabled !== 'boolean') return false
  if (!isTwinBindingTarget(value.source) || !interactionTriggers.includes(value.trigger as InteractionTrigger) || !isRecord(value.action)) return false
  const type = value.action.type
  if (!interactionActionTypes.includes(type as InteractionActionType)) return false
  if ('target' in value.action && value.action.target !== undefined && !isTwinBindingTarget(value.action.target)) return false
  if (type === 'emit-event') {
    if (typeof value.action.eventName !== 'string' || !/^[a-z][a-z0-9._:-]{0,63}$/i.test(value.action.eventName)) return false
    if ('metadata' in value.action && value.action.metadata !== undefined && (!isRecord(value.action.metadata) || !isJsonValue(value.action.metadata))) return false
  }
  if (type === 'highlight' && value.trigger !== 'hover-enter') return false
  return true
}
