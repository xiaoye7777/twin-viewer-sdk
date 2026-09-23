import type { Object3D } from 'three'

export class RuntimeVisibilityLayer {
  private readonly original = new Map<Object3D, boolean>()
  set(object: Object3D, visible: boolean): void {
    if (!this.original.has(object)) this.original.set(object, object.visible)
    object.visible = visible
  }
  getPersistent(object: Object3D): boolean { return this.original.get(object) ?? object.visible }
  dispose(): void {
    for (const [object, visible] of this.original) object.visible = visible
    this.original.clear()
  }
}
