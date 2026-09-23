import type { DeepReadonly } from 'vue'
import type { TwinBinding, TwinBindingResolution, TwinBindingTarget, TwinDevice, TwinRuntimeValue } from '@/domain/twin'
import type { InteractionMetadata, InteractionTrigger } from '@/domain/interactions'
import type { DataSourceConnectionStatus, DataSourceType, ViewerDataSourceConfig } from '@/infrastructure/data'

export type { TwinBindingTarget } from '@/domain/twin'

/** null is the whole-scene context. target is the exact selected business object. */
export type ViewerSelection = Readonly<{
  target: Readonly<TwinBindingTarget>
  bindingTarget: Readonly<TwinBindingTarget> | null
  bindingId: string | null
  deviceId: string | null
  deviceName: string | null
}> | null

export interface ViewerLoadedEvent {
  projectId: string
  projectName: string
  objectCount: number
  bindingCount: number
  warnings: string[]
}

/** Compatibility click payload; new hosts should consume selection-change. */
export interface ViewerTargetClick {
  target: TwinBindingTarget
  bindingTarget?: TwinBindingTarget
  device?: TwinDevice
  bindingId?: string
}

export interface ViewerInteractionEvent {
  eventName: string
  interactionId: string
  trigger: InteractionTrigger
  sourceTarget: Readonly<TwinBindingTarget>
  triggerTarget: Readonly<TwinBindingTarget>
  actionTarget: Readonly<TwinBindingTarget>
  deviceId: string | null
  metadata: Readonly<InteractionMetadata>
}

export type TwinSceneViewerEvents = {
  'selection-change': [selection: ViewerSelection]
  loaded: [info: ViewerLoadedEvent]
  error: [message: string]
  'target-click': [event: ViewerTargetClick]
  'device-click': [event: ViewerTargetClick]
  'interaction-event': [event: ViewerInteractionEvent]
}

export type ViewerRuntimeState = DeepReadonly<{
  projectId: string | null
  bindings: TwinBinding[]
  runtimeValues: Record<string, TwinRuntimeValue>
  resolutionByBindingId: Record<string, TwinBindingResolution>
  bindingRevision: number
  runtimeRevision: number
  resolutionRevision: number
  mockRunning: boolean
  mockTickCount: number
  dataSourceType: DataSourceType
  dataSourceStatus: DataSourceConnectionStatus
  dataSourceMessageCount: number
  dataSourceError: string | null
}> & {
  getRuntimeValue(bindingId: string, variableKey: string): DeepReadonly<TwinRuntimeValue> | null
}

export interface TwinSceneViewerPublicApi {
  focusDevice(deviceId: string): Promise<boolean>
  focusTarget(target: TwinBindingTarget): Promise<boolean>
  selectDevice(deviceId: string): boolean
  selectTarget(target: TwinBindingTarget): boolean
  clearSelection(): void
  getSelection(): ViewerSelection
  getRuntimeState(): ViewerRuntimeState | null
  setDataSource(config: ViewerDataSourceConfig): boolean
  getDiagnostics(): ViewerDiagnostics
}

export interface ViewerDiagnostics {
  dataSource: { type: DataSourceType; status: DataSourceConnectionStatus; messageCount: number; error: string | null }
  visualRules: { activations: number; activeRules: number }
  effects: { effects: number; transientOwners: number; helpers: number; outlined: number }
}
