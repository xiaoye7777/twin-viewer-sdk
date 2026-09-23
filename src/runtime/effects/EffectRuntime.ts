import {
  AdditiveBlending, Box3, BoxGeometry, CanvasTexture, Color, DoubleSide, EdgesGeometry,
  Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Path, Shape,
  ShapeGeometry, Sprite, SpriteMaterial, Vector3,
} from 'three'
import type { Material, Object3D } from 'three'
import { cloneEffects, isEffectInstance, type EffectInstance } from '@/domain/effects'
import type { MeteorScene } from '@/infrastructure/meteor3d'
import { BindingTargetResolver } from '@/internal/BindingTargetResolver'

interface Visual {
  instance: EffectInstance
  target: Object3D
  helper: Object3D
  materials: Array<LineBasicMaterial | MeshBasicMaterial | SpriteMaterial>
  dispose(): void
}
interface IsolatedMaterial { mesh: Mesh; original: Material | Material[]; clones: Material[]; signature: string }
let activeLoops = 0
export function getEffectDiagnostics(): { activeLoops: number } { return { activeLoops } }

/** Shared atomic effects. Configuration is pure data; Three resources belong here. */
export class EffectRuntime {
  readonly root = new Group()
  private readonly resolver: BindingTargetResolver
  private instances: EffectInstance[] = []
  private transient = new Map<string, EffectInstance[]>()
  private visuals: Visual[] = []
  private materials: IsolatedMaterial[] = []
  private outlined = new Set<string>()
  private frame: number | null = null
  private disposed = false
  readonly unresolved = new Set<string>()
  private readonly bounds = new Box3()
  private readonly size = new Vector3()
  private readonly center = new Vector3()

  constructor(private readonly meteor: MeteorScene, getRoots: () => readonly Object3D[]) {
    this.resolver = new BindingTargetResolver(getRoots, meteor)
    this.root.name = 'Runtime Effects'
    this.root.userData.editorInternal = true
    this.root.userData.runtimeEffect = true
    // Never add to Core's business object/BID registry or beneath a business node.
    meteor.getScene().add(this.root)
  }

  setEffects(effects: readonly EffectInstance[]): void {
    if (this.disposed) return
    if (!effects.every(isEffectInstance)) throw new Error('Invalid effect configuration')
    this.instances = cloneEffects(effects)
    this.reconcile()
  }
  setTransientEffects(owner: string, effects: readonly EffectInstance[]): void {
    if (this.disposed || !owner) return
    if (!effects.every(isEffectInstance)) throw new Error('Invalid transient effect configuration')
    if (effects.length) this.transient.set(owner, cloneEffects(effects))
    else this.transient.delete(owner)
    this.reconcile()
  }
  clearTransientEffects(owner: string): void {
    if (this.disposed || !this.transient.delete(owner)) return
    this.reconcile()
  }
  private reconcile(): void {
    const rendered = [...this.instances, ...[...this.transient.values()].flat()]
    this.unresolved.clear()
    const oldVisuals = new Map(this.visuals.map(visual => [visual.instance.id, visual]))
    const visuals: Visual[] = []
    const outlined = new Set<string>()
    const highlights: Array<{ target: Object3D; instance: EffectInstance }> = []
    for (const instance of rendered) {
      const target = this.resolver.resolve(instance.target)
      if (!target) { this.unresolved.add(instance.id); continue }
      if (instance.kind === 'outline') {
        const bid: unknown = target.userData.bid
        if (typeof bid === 'string') outlined.add(bid)
      } else if (instance.kind === 'child-highlight') highlights.push({ target, instance })
      else {
        const previous = oldVisuals.get(instance.id)
        if (previous && previous.target === target && JSON.stringify(previous.instance) === JSON.stringify(instance)) {
          visuals.push(previous); oldVisuals.delete(instance.id)
        } else visuals.push(this.createVisual(instance, target))
      }
    }
    oldVisuals.forEach(visual => visual.dispose())
    this.visuals = visuals
    for (const bid of this.outlined) if (!outlined.has(bid)) this.meteor.setOutline(bid, false)
    // Registration refresh may have cleared Core outlines while keeping the same BID.
    for (const bid of outlined) this.meteor.setOutline(bid, true)
    this.outlined = outlined
    this.applyHighlights(highlights)
    this.update(performance.now())
    if (this.visuals.length && this.frame === null) {
      activeLoops += 1
      this.frame = requestAnimationFrame(this.tick)
    }
    if (!this.visuals.length && this.frame !== null) { cancelAnimationFrame(this.frame); this.frame = null; activeLoops-- }
  }

  getSnapshot(): EffectInstance[] { return cloneEffects(this.instances) }
  getDiagnostics(): { effects: number; transientOwners: number; helpers: number; isolatedMeshes: number; outlined: number; unresolved: string[] } {
    return { effects: this.instances.length, transientOwners: this.transient.size, helpers: this.visuals.length, isolatedMeshes: this.materials.length, outlined: this.outlined.size, unresolved: [...this.unresolved] }
  }

  private applyHighlights(effects: Array<{ target: Object3D; instance: EffectInstance }>): void {
    const depth = (node: Object3D): number => { let value = 0; for (let p = node.parent; p; p = p.parent) value++; return value }
    // More-specific child wins; a deterministic single clone per mesh avoids stacked restoration bugs.
    effects.sort((a, b) => depth(a.target) - depth(b.target))
    const byMesh = new Map<Mesh, EffectInstance>()
    for (const effect of effects) effect.target.traverse(node => { if (node instanceof Mesh) byMesh.set(node, effect.instance) })
    const signature = (effect: EffectInstance) => JSON.stringify([effect.parameters.color, effect.parameters.opacity])
    this.materials = this.materials.filter(record => {
      const desired = byMesh.get(record.mesh)
      if (desired && signature(desired) === record.signature) { byMesh.delete(record.mesh); return true }
      record.mesh.material = record.original
      record.clones.forEach(material => material.dispose())
      return false
    })
    for (const [mesh, effect] of byMesh) {
      const original = mesh.material
      const clones = (Array.isArray(original) ? original : [original]).map(material => {
        const clone = material.clone()
        if ('emissive' in clone && clone.emissive instanceof Color) {
          clone.emissive.set(effect.parameters.color)
          if ('emissiveIntensity' in clone) clone.emissiveIntensity = effect.parameters.opacity * 2
        } else if ('color' in clone && clone.color instanceof Color) clone.color.lerp(new Color(effect.parameters.color), effect.parameters.opacity)
        return clone
      })
      mesh.material = Array.isArray(original) ? clones : clones[0]!
      this.materials.push({ mesh, original, clones, signature: signature(effect) })
    }
  }

  private createVisual(instance: EffectInstance, target: Object3D): Visual {
    const { color, opacity, text } = instance.parameters
    const materials: Visual['materials'] = []
    const disposers: Array<() => void> = []
    let helper: Object3D
    if (instance.kind === 'floating-label') {
      const canvas = document.createElement('canvas')
      canvas.width = 768; canvas.height = 128
      const context = canvas.getContext('2d')
      if (!context) throw new Error('无法创建 Label Canvas')
      context.fillStyle = 'rgba(15,23,42,0.85)'; context.fillRect(0, 0, 768, 128)
      context.font = '48px sans-serif'; context.fillStyle = color; context.textAlign = 'center'; context.textBaseline = 'middle'
      context.fillText(text || ' ', 384, 64, 728)
      const texture = new CanvasTexture(canvas)
      const material = new SpriteMaterial({ map: texture, transparent: true, opacity, depthWrite: false })
      materials.push(material); disposers.push(() => texture.dispose())
      helper = new Sprite(material)
    } else if (instance.kind === 'ground-pulse') {
      const shape = new Shape()
      shape.moveTo(-0.5,-0.5); shape.lineTo(0.5,-0.5); shape.lineTo(0.5,0.5); shape.lineTo(-0.5,0.5); shape.closePath()
      const hole = new Path()
      hole.moveTo(-0.45,-0.45); hole.lineTo(-0.45,0.45); hole.lineTo(0.45,0.45); hole.lineTo(0.45,-0.45); hole.closePath(); shape.holes.push(hole)
      const geometry = new ShapeGeometry(shape); geometry.rotateX(-Math.PI/2)
      const material = new MeshBasicMaterial({ color, transparent: true, opacity, side: DoubleSide, depthWrite: false, blending: AdditiveBlending })
      helper = new Mesh(geometry, material)
      materials.push(material); disposers.push(() => geometry.dispose())
    } else {
      const geometry = new BoxGeometry(1,1,1), edges = new EdgesGeometry(geometry)
      const surface = new MeshBasicMaterial({ color, transparent: true, opacity: opacity * 0.12, depthWrite: false, blending: AdditiveBlending })
      const line = new LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: AdditiveBlending })
      const group = new Group(); group.add(new Mesh(geometry, surface), new LineSegments(edges, line)); helper = group
      materials.push(surface, line); disposers.push(() => geometry.dispose(), () => edges.dispose())
    }
    helper.name = `Effect:${instance.id}`
    helper.traverse(node => { node.userData.runtimeEffect = true; node.userData.editorInternal = true; node.raycast = () => {} })
    this.root.add(helper)
    return { instance, target, helper, materials, dispose: () => { helper.removeFromParent(); disposers.forEach(dispose => dispose()); materials.forEach(material => material.dispose()) } }
  }

  private readonly tick = (time: number): void => {
    this.update(time)
    this.frame = requestAnimationFrame(this.tick)
  }
  private update(time: number): void {
    for (const visual of this.visuals) {
      const { target, helper, instance, materials } = visual
      let visible = true
      for (let node: Object3D | null = target; node; node = node.parent) if (!node.visible) visible = false
      target.updateWorldMatrix(true, true)
      this.bounds.setFromObject(target, true)
      helper.visible = visible && !this.bounds.isEmpty()
      if (!helper.visible) continue
      const { padding, speed, opacity } = instance.parameters
      this.bounds.getSize(this.size).addScalar(2 * padding).max(new Vector3(0.01,0.01,0.01))
      this.bounds.getCenter(this.center)
      const phase = time / 1000 * speed
      helper.position.copy(this.center)
      if (instance.kind === 'floating-label') {
        helper.position.y = this.bounds.max.y + padding + 0.4
        helper.scale.set(3,0.5,1)
      } else if (instance.kind === 'ground-pulse') {
        const pulse = speed === 0 ? 0.5 : phase % 1
        helper.position.y = this.bounds.min.y + 0.025
        helper.scale.set(this.size.x * (1 + pulse * 0.35), 1, this.size.z * (1 + pulse * 0.35))
        materials[0]!.opacity = opacity * (1 - pulse)
      } else {
        helper.scale.copy(this.size)
        const breath = speed === 0 ? 1 : 0.55 + 0.45 * Math.sin(phase * Math.PI * 2)
        materials[0]!.opacity = opacity * breath * 0.12
        materials[1]!.opacity = opacity * breath
      }
    }
  }

  private clear(): void {
    if (this.frame !== null) { cancelAnimationFrame(this.frame); this.frame = null; activeLoops -= 1 }
    this.visuals.forEach(visual => visual.dispose()); this.visuals = []
    for (const { mesh, original, clones } of this.materials) { mesh.material = original; clones.forEach(material => material.dispose()) }
    this.materials = []
    for (const bid of this.outlined) this.meteor.setOutline(bid, false)
    this.outlined.clear(); this.unresolved.clear()
  }
  dispose(): void {
    if (this.disposed) return
    this.clear(); this.instances = []; this.transient.clear(); this.root.removeFromParent(); this.disposed = true
  }
}
