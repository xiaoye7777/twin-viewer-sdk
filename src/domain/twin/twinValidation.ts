import type { TwinBinding } from './bindingTypes'
import { isTwinBindingTarget } from './bindingTarget'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isTwinBinding(value: unknown): value is TwinBinding {
  if (!isRecord(value) || typeof value.id !== 'string' || !isTwinBindingTarget(value.target)) return false
  if (!isRecord(value.device) || typeof value.device.id !== 'string' || typeof value.device.name !== 'string') return false
  if (value.device.type !== undefined && typeof value.device.type !== 'string') return false
  if (!Array.isArray(value.variables)) return false
  return value.variables.every((variable) => (
    isRecord(variable) &&
    typeof variable.id === 'string' &&
    typeof variable.key === 'string' &&
    typeof variable.name === 'string' &&
    (variable.dataType === 'number' || variable.dataType === 'boolean' || variable.dataType === 'string') &&
    (variable.unit === undefined || typeof variable.unit === 'string')
  ))
}
