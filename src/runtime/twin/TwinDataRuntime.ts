import type { UnwrapNestedRefs } from 'vue'
import type { TwinBinding } from '@/domain/twin'
import { BindingTargetResolver } from '@/internal/BindingTargetResolver'
import { MockDataSource } from '@/infrastructure/data'
import type { createTwinState } from './createTwinState'

export type TwinRuntimeState = UnwrapNestedRefs<ReturnType<typeof createTwinState>>

/** Per-scene data lifecycle, shared by Editor and Viewer. */
export class TwinDataRuntime {
  private readonly source: MockDataSource
  constructor(readonly state: TwinRuntimeState, private readonly resolver: BindingTargetResolver) {
    this.source = new MockDataSource({
      getBindings: () => state.bindings.filter((binding) => state.resolutionByBindingId[binding.id] === 'resolved'),
      setRuntimeValue: (id, key, value) => state.setRuntimeValue(id, key, value),
      onTick: () => state.recordMockTick(),
    })
  }
  initialize(projectId: string, bindings: readonly TwinBinding[]): void {
    this.stop()
    this.state.initializeProject(projectId, bindings)
    this.refresh()
  }
  refresh(): void {
    for (const binding of this.state.bindings) {
      this.state.setResolutionStatus(binding.id, this.resolver.resolve(binding.target) ? 'resolved' : 'unresolved')
    }
  }
  start(): void { this.refresh(); this.source.start(); this.state.setMockRunning(true) }
  stop(): void { this.source.stop(); this.state.setMockRunning(false) }
}
