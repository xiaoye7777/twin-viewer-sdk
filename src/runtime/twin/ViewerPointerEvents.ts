import { Vector2 } from 'three'
import type { Object3D } from 'three'
import { twinBindingTargetKey } from '@/domain/twin'
import type { ViewerTargetClick } from '@/components/viewerContract'
export type { ViewerTargetClick } from '@/components/viewerContract'
import type { MeteorScene } from '@/infrastructure/meteor3d'
import { bindingTargetFromObject } from '@/internal/BindingTargetResolver'
import type { TwinRuntimeState } from './TwinDataRuntime'

const DOUBLE_CLICK_MS = 260

/** One pointer dispatcher for selection and configured interaction triggers. */
export class ViewerPointerEvents {
  private start: { id: number; x: number; y: number; moved: boolean } | null = null
  private readonly pointers = new Set<number>()
  private pending: { hit: ViewerTargetClick | null; key: string; time: number; timer: ReturnType<typeof setTimeout> } | null = null
  private hover: ViewerTargetClick | null = null
  private hoverFrame: number | null = null
  private hoverPoint = { x: 0, y: 0 }
  private disposed = false
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly runtime: MeteorScene,
    private readonly roots: readonly Object3D[] | (() => readonly Object3D[]),
    private readonly twin: TwinRuntimeState,
    private readonly onClick: (event: ViewerTargetClick) => void,
    private readonly onBlank: () => void = () => {},
    private readonly onDoubleClick: (event: ViewerTargetClick) => void = () => {},
    private readonly onHoverEnter: (event: ViewerTargetClick) => void = () => {},
    private readonly onHoverLeave: (event: ViewerTargetClick) => void = () => {},
  ) {
    canvas.addEventListener('pointerdown', this.down)
    canvas.addEventListener('pointermove', this.hoverMove)
    canvas.addEventListener('pointerleave', this.leave)
    window.addEventListener('pointermove', this.move)
    window.addEventListener('pointerup', this.up)
    window.addEventListener('pointercancel', this.cancel)
  }
  private readonly down = (event: PointerEvent): void => {
    this.pointers.add(event.pointerId)
    if (this.pointers.size > 1) { this.start = null; return }
    if (event.button === 0) this.start = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
  }
  private readonly move = (event: PointerEvent): void => {
    if (this.start?.id === event.pointerId && Math.hypot(event.clientX - this.start.x, event.clientY - this.start.y) > 5) this.start.moved = true
  }
  private readonly cancel = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId)
    if (this.start?.id === event.pointerId) this.start = null
  }
  private readonly up = (event: PointerEvent): void => {
    const start = this.start
    this.cancel(event)
    if (!start || start.id !== event.pointerId || start.moved || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return
    const hit = this.resolve(event.clientX, event.clientY)
    const key = hit ? twinBindingTargetKey(hit.target) : 'blank'
    const now = Date.now()
    if (this.pending && this.pending.key === key && now - this.pending.time <= DOUBLE_CLICK_MS) {
      clearTimeout(this.pending.timer); this.pending = null
      if (hit) this.onDoubleClick(hit); else this.onBlank()
      return
    }
    if (this.pending) this.flushPending()
    const timer = setTimeout(() => this.flushPending(), DOUBLE_CLICK_MS)
    this.pending = { hit, key, time: now, timer }
  }
  private flushPending(): void {
    const pending = this.pending
    if (!pending || this.disposed) return
    clearTimeout(pending.timer); this.pending = null
    if (pending.hit) this.onClick(pending.hit); else this.onBlank()
  }
  private readonly hoverMove = (event: PointerEvent): void => {
    if (this.pointers.size) return
    this.hoverPoint = { x: event.clientX, y: event.clientY }
    if (this.hoverFrame !== null) return
    this.hoverFrame = requestAnimationFrame(() => {
      this.hoverFrame = null
      const next = this.resolve(this.hoverPoint.x, this.hoverPoint.y)
      const beforeKey = this.hover ? twinBindingTargetKey(this.hover.target) : ''
      const nextKey = next ? twinBindingTargetKey(next.target) : ''
      if (beforeKey === nextKey) return
      if (this.hover) this.onHoverLeave(this.hover)
      this.hover = next
      if (next) this.onHoverEnter(next)
    })
  }
  private readonly leave = (): void => {
    if (this.hoverFrame !== null) { cancelAnimationFrame(this.hoverFrame); this.hoverFrame = null }
    if (this.hover) this.onHoverLeave(this.hover)
    this.hover = null
  }
  private resolve(clientX: number, clientY: number): ViewerTargetClick | null {
    const roots = typeof this.roots === 'function' ? this.roots() : this.roots
    const rect = this.canvas.getBoundingClientRect()
    if (!rect.width || !rect.height || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null
    const hits = this.runtime.raycastObjects(new Vector2(
      (clientX - rect.left) / rect.width * 2 - 1,
      1 - (clientY - rect.top) / rect.height * 2,
    ), { recursive: true, includeTileMap: false })
    for (const hit of hits) {
      const chain: Object3D[] = []
      let node: Object3D | null = hit.object
      while (node) { chain.push(node); if (roots.includes(node)) break; node = node.parent }
      if (!node || chain.some(item => !item.visible)) continue
      const target = chain.map(bindingTargetFromObject).find(item => item !== null)
      if (!target) continue
      const binding = chain.map(bindingTargetFromObject).map(item => item ? this.twin.getBindingByTarget(item) : null).find(item => item !== null)
      return { target, bindingTarget: binding?.target, device: binding?.device, bindingId: binding?.id }
    }
    return null
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.canvas.removeEventListener('pointerdown', this.down)
    this.canvas.removeEventListener('pointermove', this.hoverMove)
    this.canvas.removeEventListener('pointerleave', this.leave)
    window.removeEventListener('pointermove', this.move)
    window.removeEventListener('pointerup', this.up)
    window.removeEventListener('pointercancel', this.cancel)
    if (this.pending) clearTimeout(this.pending.timer)
    if (this.hoverFrame !== null) cancelAnimationFrame(this.hoverFrame)
    this.pending = null; this.hoverFrame = null; this.hover = null; this.start = null; this.pointers.clear()
  }
}
