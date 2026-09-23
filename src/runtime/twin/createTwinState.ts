import { ref, shallowRef } from 'vue'
import {
  twinBindingTargetKey,
  type TwinBinding,
  type TwinBindingResolution,
  type TwinBindingTarget,
  type TwinRuntimeValue,
  type TwinRuntimeValueData,
} from '@/domain/twin'

function cloneBinding(binding: TwinBinding): TwinBinding {
  return {
    id: binding.id,
    target: { ...binding.target },
    device: { ...binding.device },
    variables: binding.variables.map((variable) => ({ ...variable })),
  }
}

function runtimeValueKey(bindingId: string, variableKey: string): string {
  return `${bindingId}:${variableKey}`
}

export function createTwinState(onConfigurationChanged: () => void = () => {} ) {
  const projectId = ref<string | null>(null)
  const bindings = shallowRef<TwinBinding[]>([])
  const runtimeValues = shallowRef<Record<string, TwinRuntimeValue>>({})
  const resolutionByBindingId = shallowRef<Record<string, TwinBindingResolution>>({})
  const bindingRevision = ref(0)
  const runtimeRevision = ref(0)
  const resolutionRevision = ref(0)
  const mockRunning = ref(false)
  const mockTickCount = ref(0)

  function initializeProject(nextProjectId: string, savedBindings: readonly TwinBinding[] = []): void {
    projectId.value = nextProjectId
    bindings.value = savedBindings.map(cloneBinding)
    runtimeValues.value = {}
    resolutionByBindingId.value = {}
    bindingRevision.value += 1
    runtimeRevision.value += 1
    resolutionRevision.value += 1
    mockTickCount.value = 0
  }

  function resetProject(leavingProjectId: string): void {
    if (projectId.value !== leavingProjectId) return
    projectId.value = null
    bindings.value = []
    runtimeValues.value = {}
    resolutionByBindingId.value = {}
    bindingRevision.value += 1
    runtimeRevision.value += 1
    resolutionRevision.value += 1
    mockRunning.value = false
    mockTickCount.value = 0
  }

  function getBindingByTarget(target: TwinBindingTarget): TwinBinding | null {
    const key = twinBindingTargetKey(target)
    return bindings.value.find((binding) => twinBindingTargetKey(binding.target) === key) ?? null
  }

  function getBindingById(bindingId: string): TwinBinding | null {
    return bindings.value.find((binding) => binding.id === bindingId) ?? null
  }

  function upsertBinding(binding: TwinBinding): void {
    const targetKey = twinBindingTargetKey(binding.target)
    bindings.value = [
      ...bindings.value.filter((item) => item.id !== binding.id && twinBindingTargetKey(item.target) !== targetKey),
      cloneBinding(binding),
    ]
    bindingRevision.value += 1
    onConfigurationChanged()
  }

  function removeBindingByTarget(target: TwinBindingTarget): TwinBinding | null {
    const binding = getBindingByTarget(target)
    if (!binding) return null
    bindings.value = bindings.value.filter((item) => item.id !== binding.id)
    const nextValues = { ...runtimeValues.value }
    for (const key of Object.keys(nextValues)) {
      if (key.startsWith(`${binding.id}:`)) delete nextValues[key]
    }
    runtimeValues.value = nextValues
    bindingRevision.value += 1
    runtimeRevision.value += 1
    onConfigurationChanged()
    return cloneBinding(binding)
  }

  function removeBindingsForTargets(targets: readonly TwinBindingTarget[]): TwinBinding[] {
    const targetKeys = new Set(targets.map(twinBindingTargetKey))
    const removed = bindings.value.filter((binding) => targetKeys.has(twinBindingTargetKey(binding.target)))
    if (!removed.length) return []
    const removedIds = new Set(removed.map((binding) => binding.id))
    bindings.value = bindings.value.filter((binding) => !removedIds.has(binding.id))
    const nextValues = { ...runtimeValues.value }
    for (const key of Object.keys(nextValues)) {
      if (removed.some((binding) => key.startsWith(`${binding.id}:`))) delete nextValues[key]
    }
    runtimeValues.value = nextValues
    bindingRevision.value += 1
    runtimeRevision.value += 1
    onConfigurationChanged()
    return removed.map(cloneBinding)
  }

  function restoreBindings(restored: readonly TwinBinding[]): void {
    if (!restored.length) return
    const restoredIds = new Set(restored.map((binding) => binding.id))
    const restoredTargets = new Set(restored.map((binding) => twinBindingTargetKey(binding.target)))
    bindings.value = [
      ...bindings.value.filter((binding) => !restoredIds.has(binding.id) && !restoredTargets.has(twinBindingTargetKey(binding.target))),
      ...restored.map(cloneBinding),
    ]
    bindingRevision.value += 1
    onConfigurationChanged()
  }

  function setRuntimeValue(bindingId: string, variableKey: string, value: TwinRuntimeValueData): void {
    runtimeValues.value = {
      ...runtimeValues.value,
      [runtimeValueKey(bindingId, variableKey)]: {
        bindingId,
        variableKey,
        value,
        updatedAt: new Date().toISOString(),
      },
    }
    runtimeRevision.value += 1
  }

  function getRuntimeValue(bindingId: string, variableKey: string): TwinRuntimeValue | null {
    return runtimeValues.value[runtimeValueKey(bindingId, variableKey)] ?? null
  }

  function setResolutionStatus(bindingId: string, status: TwinBindingResolution): void {
    if (resolutionByBindingId.value[bindingId] === status) return
    resolutionByBindingId.value = { ...resolutionByBindingId.value, [bindingId]: status }
    resolutionRevision.value += 1
  }

  function setMockRunning(value: boolean): void { mockRunning.value = value }
  function recordMockTick(): void { mockTickCount.value += 1 }

  return {
    projectId,
    bindings,
    runtimeValues,
    resolutionByBindingId,
    bindingRevision,
    runtimeRevision,
    resolutionRevision,
    mockRunning,
    mockTickCount,
    initializeProject,
    resetProject,
    getBindingByTarget,
    getBindingById,
    upsertBinding,
    removeBindingByTarget,
    removeBindingsForTargets,
    restoreBindings,
    setRuntimeValue,
    getRuntimeValue,
    setResolutionStatus,
    setMockRunning,
    recordMockTick,
    cloneBindings: () => bindings.value.map(cloneBinding),
  }
}
