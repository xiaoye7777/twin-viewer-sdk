import type { Object3D } from 'three'
import { cloneInteractions, type InteractionTrigger, type SceneInteraction } from '@/domain/interactions'
import { twinBindingTargetKey, type TwinBindingTarget } from '@/domain/twin'
import type { ViewerInteractionEvent, ViewerTargetClick } from '@/components/viewerContract'
import type { BindingTargetResolver } from '@/internal/BindingTargetResolver'
import type { EffectRuntime } from '@/runtime/effects/EffectRuntime'
import { createEffect } from '@/domain/effects'
import { RuntimeVisibilityLayer } from './runtimeVisibility'

export interface InteractionDiagnostics {
  total: number
  enabled: number
  unresolved: string[]
  hoverTarget: TwinBindingTarget | null
  pointerActive: boolean
}

export interface InteractionRuntimeOptions {
  resolver: BindingTargetResolver
  effects: EffectRuntime
  selectTarget(target: TwinBindingTarget): boolean
  clearSelection(): void
  focusTarget(target: TwinBindingTarget): Promise<boolean>
  resolveDeviceId?(target: TwinBindingTarget): string | null
  emit(event: ViewerInteractionEvent): void
  publish?(diagnostics: InteractionDiagnostics): void
}

export class InteractionRuntime {
  private interactions: SceneInteraction[] = []
  private disposed = false
  private hoverTarget: TwinBindingTarget | null = null
  private hoverOwners = new Set<string>()
  private pointerActive = false
  private readonly visibility = new RuntimeVisibilityLayer()
  constructor(private readonly options: InteractionRuntimeOptions) {}

  setInteractions(values: readonly SceneInteraction[]): void {
    if (this.disposed) return
    this.clearHoverEffects()
    this.hoverTarget = null
    this.interactions = cloneInteractions(values)
    this.publish()
  }
  setPointerActive(active: boolean): void { this.pointerActive = active; this.publish() }
  getPersistentVisibility(object: Object3D): boolean { return this.visibility.getPersistent(object) }

  async dispatch(trigger: InteractionTrigger, input: ViewerTargetClick): Promise<void> {
    if (this.disposed) return
    if (trigger === 'hover-leave') this.clearHoverEffects()
    this.hoverTarget = trigger === 'hover-enter' ? { ...input.target } : trigger === 'hover-leave' ? null : this.hoverTarget
    const matches = this.interactions.filter(item => item.enabled && item.trigger === trigger && this.matches(item.source, input.target))
    for (const interaction of matches) {
      if (this.disposed) return
      const target = 'target' in interaction.action && interaction.action.target ? interaction.action.target : interaction.source
      switch (interaction.action.type) {
        case 'select': this.options.selectTarget(target); break
        case 'clear-selection': this.options.clearSelection(); break
        case 'focus': await this.options.focusTarget(target); break
        case 'show': { const object = this.options.resolver.resolve(target); if (object) this.visibility.set(object, true); break }
        case 'hide': { const object = this.options.resolver.resolve(target); if (object) this.visibility.set(object, false); break }
        case 'highlight': {
          const effect = createEffect('outline', target)
          effect.id = `interaction:hover:${interaction.id}`
          const owner = `interaction:hover:${interaction.id}`
          this.options.effects.setTransientEffects(owner, [effect]); this.hoverOwners.add(owner)
          break
        }
        case 'emit-event': this.options.emit(Object.freeze({
          eventName: interaction.action.eventName,
          interactionId: interaction.id,
          trigger,
          sourceTarget: Object.freeze({ ...interaction.source }),
          triggerTarget: Object.freeze({ ...input.target }),
          actionTarget: Object.freeze({ ...target }),
          deviceId: this.options.resolveDeviceId?.(interaction.source) ?? input.device?.id ?? null,
          metadata: Object.freeze(structuredClone(interaction.action.metadata ?? {})),
        })); break
      }
    }
    this.publish()
  }

  getDiagnostics(): InteractionDiagnostics {
    const unresolved = this.interactions.filter(item => {
      if (!this.options.resolver.resolve(item.source)) return true
      return 'target' in item.action && item.action.target ? !this.options.resolver.resolve(item.action.target) : false
    }).map(item => item.id)
    return { total: this.interactions.length, enabled: this.interactions.filter(item => item.enabled).length,
      unresolved, hoverTarget: this.hoverTarget ? { ...this.hoverTarget } : null, pointerActive: this.pointerActive }
  }
  private matches(source: TwinBindingTarget, actual: TwinBindingTarget): boolean {
    if (twinBindingTargetKey(source) === twinBindingTargetKey(actual)) return true
    const sourceObject = this.options.resolver.resolve(source)
    let actualObject = this.options.resolver.resolve(actual)
    while (actualObject) { if (actualObject === sourceObject) return true; actualObject = actualObject.parent }
    return false
  }
  private clearHoverEffects(): void {
    for (const owner of this.hoverOwners) this.options.effects.clearTransientEffects(owner)
    this.hoverOwners.clear()
  }
  private publish(): void { this.options.publish?.(this.getDiagnostics()) }
  dispose(): void {
    if (this.disposed) return
    this.clearHoverEffects(); this.visibility.dispose(); this.hoverTarget = null; this.interactions = []; this.pointerActive = false
    this.disposed = true; this.publish()
  }
}
