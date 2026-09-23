import type { TwinDevice, TwinVariableDefinition } from './twinTypes'
import type { TwinBindingTarget } from './bindingTarget'

export interface TwinBinding {
  id: string
  target: TwinBindingTarget
  device: TwinDevice
  variables: TwinVariableDefinition[]
}

export type TwinBindingResolution = 'resolved' | 'unresolved'
