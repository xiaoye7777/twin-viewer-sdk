import type { UnwrapNestedRefs } from 'vue'
import type { TwinBinding } from '@/domain/twin'
import { BindingTargetResolver } from '@/internal/BindingTargetResolver'
import { MockDataSource, WebSocketDataSource, type DataSource, type ViewerDataSourceConfig } from '@/infrastructure/data'
import type { createTwinState } from './createTwinState'

export type TwinRuntimeState = UnwrapNestedRefs<ReturnType<typeof createTwinState>>

/** Per-scene data lifecycle, shared by Editor and Viewer. */
export class TwinDataRuntime {
  private source: DataSource | null = null
  private sourceType: ViewerDataSourceConfig['type'] = 'mock'
  constructor(readonly state: TwinRuntimeState, private readonly resolver: BindingTargetResolver) {
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
  start(config: ViewerDataSourceConfig = { type: 'mock' }): void { this.refresh(); this.setDataSource(config) }
  setDataSource(config: ViewerDataSourceConfig): void {
    this.stop()
    this.state.clearRuntimeValues()
    this.state.resetDataSourceMessages()
    this.sourceType = config.type
    this.state.setDataSourceState(config.type, config.type === 'mock' ? 'connected' : 'connecting')
    const getBindings = () => this.state.bindings.filter(binding => this.state.resolutionByBindingId[binding.id] === 'resolved')
    if (config.type === 'mock') {
      this.source = new MockDataSource({
        getBindings,
        setRuntimeValue: (id, key, value) => this.state.setRuntimeValue(id, key, value),
        onTick: () => { this.state.recordMockTick(); this.state.recordDataSourceMessage() },
      })
      this.state.setMockRunning(true)
    } else {
      this.source = new WebSocketDataSource({
        url: config.url,
        getBindings,
        setRuntimeValue: (id, key, value) => this.state.setRuntimeValue(id, key, value),
        onStatus: (status, error) => this.state.setDataSourceState('websocket', status, error),
        onMessage: () => this.state.recordDataSourceMessage(),
      })
      this.state.setMockRunning(false)
    }
    this.source.start()
  }
  stop(): void {
    this.source?.stop()
    this.source = null
    this.state.setMockRunning(false)
    this.state.setDataSourceState(this.sourceType, 'disconnected')
  }
}
