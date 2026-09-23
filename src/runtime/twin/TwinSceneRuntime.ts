import { reactive } from 'vue'
import { EffectRuntime } from '@/runtime/effects/EffectRuntime'
import { VisualRuleRuntime } from '@/runtime/effects/VisualRuleRuntime'
import type { Object3D } from 'three'
import { twinBindingTargetKey, type TwinBindingTarget } from '@/domain/twin'
import type { ViewerInteractionEvent, ViewerSelection } from '@/components/viewerContract'
import { createViewerRuntimeState } from './viewerRuntimeState'
import type { SceneRepository } from '@/runtime/scene/SceneRepository'
import type { AssetRepository } from '@/infrastructure/assets'
import { MeteorScene } from '@/infrastructure/meteor3d'
import { SceneRuntimeLoader } from '@/runtime/scene/SceneRuntimeLoader'
import { BindingTargetResolver, bindingTargetFromObject } from '@/internal/BindingTargetResolver'
import { createTwinState } from './createTwinState'
import { TwinDataRuntime } from './TwinDataRuntime'
import { ViewerPointerEvents, type ViewerTargetClick } from './ViewerPointerEvents'
import { InteractionRuntime } from '@/runtime/interactions/InteractionRuntime'

/** One independent runtime session per Viewer; repositories are injected. */
export class TwinSceneRuntime {
  readonly twin = reactive(createTwinState())
  readonly runtimeState = createViewerRuntimeState(this.twin)
  private selection: ViewerSelection = null
  readonly meteor: MeteorScene
  readonly loader: SceneRuntimeLoader
  roots: Object3D[] = []
  private readonly resolver: BindingTargetResolver
  private readonly data: TwinDataRuntime
  private pointers: ViewerPointerEvents | null = null
  private disposed = false
  private started = false
  effects: EffectRuntime | null = null
  visualRules: VisualRuleRuntime | null = null
  interactions: InteractionRuntime | null = null

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly scenes: SceneRepository,
    assets: AssetRepository,
    private readonly onClick: (event: ViewerTargetClick) => void,
    private readonly onSelectionChange: (selection: ViewerSelection) => void = () => {},
    private readonly onInteractionEvent: (event: ViewerInteractionEvent) => void = () => {},
  ) {
    this.meteor = new MeteorScene(canvas)
    this.loader = new SceneRuntimeLoader(this.meteor, assets)
    this.resolver = new BindingTargetResolver(() => this.roots, this.meteor)
    this.data = new TwinDataRuntime(this.twin, this.resolver)
  }

  async load(projectId: string): Promise<string[]> {
    if (this.started || this.disposed) throw new Error('Runtime session already used')
    this.started = true
    try {
      const document = await this.scenes.load(projectId)
      if (this.disposed) return []
      if (!document) throw new Error('该项目尚未保存场景，请先在 Editor 中保存')
      await this.meteor.initialize()
      if (this.disposed) return []
      const restored = await this.loader.restore(document)
      if (this.disposed) return []
      this.roots = restored.roots
      this.effects = new EffectRuntime(this.meteor, () => this.roots)
      this.data.initialize(projectId, document.bindings ?? [])
      this.visualRules = new VisualRuleRuntime(this.effects, this.twin, this.resolver, () => document.visualRules ?? [], () => document.effects ?? [])
      this.interactions = new InteractionRuntime({
        resolver: this.resolver,
        effects: this.effects,
        selectTarget: target => this.selectTarget(target),
        clearSelection: () => this.clearSelection(),
        focusTarget: target => this.focusTarget(target),
        resolveDeviceId: target => this.twin.getBindingByTarget(target)?.device.id ?? null,
        emit: event => { if (!this.disposed) this.onInteractionEvent(event) },
      })
      this.interactions.setInteractions(document.interactions ?? [])
      this.interactions.setPointerActive(true)
      this.data.start()
      this.pointers = new ViewerPointerEvents(this.canvas, this.meteor, this.roots, this.twin, (event) => {
        if (this.disposed) return
        this.selectTarget(event.target)
        if (!this.disposed) this.onClick(event)
        void this.interactions?.dispatch('click', event)
      }, () => this.clearSelection(),
      event => { this.selectTarget(event.target); void this.interactions?.dispatch('double-click', event) },
      event => { void this.interactions?.dispatch('hover-enter', event) },
      event => { void this.interactions?.dispatch('hover-leave', event) })
      const unresolved = this.twin.bindings.filter((binding) => this.twin.resolutionByBindingId[binding.id] === 'unresolved')
      return [...restored.warnings, ...unresolved.map((binding) => `设备绑定未解析: ${binding.device.id}`)]
    } catch (error) {
      this.dispose()
      throw error
    }
  }

  getRuntimeObject(target: TwinBindingTarget): Object3D | null {
    return this.disposed ? null : this.resolver.resolve(target)
  }
  getSelection(): ViewerSelection { return this.selection }

  selectDevice(deviceId: string): boolean {
    if (this.disposed) return false
    const binding = this.twin.bindings.find((item) => item.device.id === deviceId && this.resolver.resolve(item.target))
    return binding ? this.selectTarget(binding.target) : false
  }

  selectTarget(target: TwinBindingTarget): boolean {
    let object = this.getRuntimeObject(target)
    if (!object) return false
    let binding = null
    while (object) {
      const identity = bindingTargetFromObject(object)
      binding = identity ? this.twin.getBindingByTarget(identity) : null
      if (binding || this.roots.includes(object)) break
      object = object.parent
    }
    this.setSelection(Object.freeze({
      target: Object.freeze({ ...target }),
      bindingTarget: binding ? Object.freeze({ ...binding.target }) : null,
      bindingId: binding?.id ?? null,
      deviceId: binding?.device.id ?? null,
      deviceName: binding?.device.name ?? null,
    }))
    return true
  }

  clearSelection(): void { this.setSelection(null) }

  private setSelection(next: ViewerSelection): void {
    if (this.disposed) return
    const before = this.selection
    if (before === next || (before && next &&
      twinBindingTargetKey(before.target) === twinBindingTargetKey(next.target) &&
      before.bindingId === next.bindingId && before.deviceId === next.deviceId && before.deviceName === next.deviceName)) return
    this.selection = next
    this.onSelectionChange(next)
  }
  async focusTarget(target: TwinBindingTarget): Promise<boolean> {
    const object = this.getRuntimeObject(target)
    const bid: unknown = object?.userData.bid
    if (typeof bid !== 'string') return false
    await this.meteor.focusObject(bid)
    return true
  }
  async focusDevice(deviceId: string): Promise<boolean> {
    const binding = this.twin.bindings.find((item) => item.device.id === deviceId && this.twin.resolutionByBindingId[item.id] === 'resolved')
    return binding ? this.focusTarget(binding.target) : false
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.selection = null
    this.pointers?.dispose()
    this.pointers = null
    this.interactions?.dispose()
    this.interactions = null
    this.visualRules?.dispose()
    this.visualRules = null
    this.data.stop()
    this.effects?.dispose()
    this.effects = null
    this.loader.dispose()
    this.meteor.dispose()
    this.roots = []
    if (this.twin.projectId) this.twin.resetProject(this.twin.projectId)
  }
}
