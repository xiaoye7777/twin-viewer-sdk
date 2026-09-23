import type {
  PersistenceManager as PersistenceManagerType,
  SceneManager as SceneManagerType,
} from '@meteor3d/core'
import { Mesh, REVISION, Vector2 } from 'three'
import type { Intersection, Object3D, PerspectiveCamera, Scene, Texture, Vector3 } from 'three'
import type {
  MeteorDisposeDiagnostics,
  MeteorRaycastOptions,
  MeteorRuntimeDiagnostics,
  MeteorCameraView,
  MeteorSetViewOptions,
} from './types'

type MeshRaycast = Mesh['raycast']

interface MeteorRuntimeGlobal {
  __digitalTwinOriginalMeshRaycast__?: MeshRaycast
}

const runtimeGlobal = globalThis as typeof globalThis & MeteorRuntimeGlobal
const meshRaycastBeforeFirstCoreImport =
  runtimeGlobal.__digitalTwinOriginalMeshRaycast__ ?? Mesh.prototype.raycast

runtimeGlobal.__digitalTwinOriginalMeshRaycast__ = meshRaycastBeforeFirstCoreImport

let lastDisposeDiagnostics: MeteorDisposeDiagnostics | null = null

function functionName(value: MeshRaycast): string {
  return value.name || '(anonymous)'
}

export function getLastMeteorDisposeDiagnostics(): MeteorDisposeDiagnostics | null {
  return lastDisposeDiagnostics ? { ...lastDisposeDiagnostics } : null
}

export class MeteorScene {
  private manager: SceneManagerType | null = null
  private persistenceManager: PersistenceManagerType | null = null
  private resizeObserver: ResizeObserver | null = null
  private disposed = false
  private pendingModelLoads = 0
  private resizeObserverDisconnected = false
  private raycastBeforeCoreImport: MeshRaycast = Mesh.prototype.raycast
  private raycastAfterCoreImport: MeshRaycast = Mesh.prototype.raycast
  private raycastAfterManagerInitialization: MeshRaycast = Mesh.prototype.raycast

  constructor(private readonly canvas: HTMLCanvasElement) {}

  async initialize(): Promise<void> {
    if (this.manager) return
    if (this.disposed) throw new Error('Cannot initialize a disposed MeteorScene')

    this.raycastBeforeCoreImport = Mesh.prototype.raycast
    const { PersistenceManager, SceneManager } = await import('@meteor3d/core')
    this.raycastAfterCoreImport = Mesh.prototype.raycast

    if (this.disposed) return

    this.manager = new SceneManager(this.canvas)
    this.persistenceManager = new PersistenceManager(this.manager)
    this.raycastAfterManagerInitialization = Mesh.prototype.raycast

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.canvas)
    this.resize()
  }

  addObject<T extends Object3D>(object: T): boolean {
    return this.requireManager().addObject(object)
  }
  removeObject(object: Object3D): void {
    const manager = this.requireManager()
    // Core cannot disable an outline by BID after unregisterTree. Clear before removal.
    object.traverse(node => {
      const bid: unknown = node.userData.bid
      if (typeof bid === 'string' && manager.findObjectByBid(bid)) manager.disableOutline(bid)
    })
    manager.removeObject(object)
  }

  async loadGLTFModel(url: string): Promise<Object3D> {
    const persistence = this.requirePersistenceManager()
    this.pendingModelLoads += 1
    try {
      const model = await persistence.loadGLTFModel(url)
      if (this.disposed) throw new DOMException('Model loading cancelled', 'AbortError')
      return model
    } finally {
      this.pendingModelLoads -= 1
      // Core's asynchronous loader can populate its cache after scene teardown.
      // Keep cache ownership until all pending loads settle, then free it once.
      if (this.disposed && this.pendingModelLoads === 0) persistence.dispose()
    }
  }

  focusObject(bid: string): Promise<void> {
    return this.requireManager().focusObject(bid)
  }
  fitScene(): Promise<void> { return this.requireManager().fitCameraToScene() }
  setOutline(bid: string, enabled: boolean): void {
    const manager = this.requireManager()
    if (enabled) manager.enableOutline(bid, { color: 0xffb020, thickness: 1, strength: 3 })
    else if (manager.findObjectByBid(bid)) manager.disableOutline(bid)
  }

  findObjectByBid<T extends Object3D>(bid: string): T | null {
    return this.requireManager().findObjectByBid<T>(bid)
  }

  getScene(): Scene {
    return this.requireManager().scene
  }

  getCamera(): PerspectiveCamera {
    return this.requireManager().camera
  }

  getDomElement(): HTMLCanvasElement {
    return this.requireManager().renderer.domElement
  }

  raycastObjects(
    screenPosition: Vector2,
    options: MeteorRaycastOptions = {},
  ): Intersection<Object3D>[] {
    return this.requireManager().raycastObjects(screenPosition, options)
  }

  raycastGround(screenPosition: Vector2): Vector3 | null {
    return this.requireManager().raycastGround(screenPosition)
  }

  isCameraControlsEnabled(): boolean {
    return this.requireManager().controls.enabled
  }

  setCameraControlsEnabled(enabled: boolean): void {
    this.requireManager().controls.enabled = enabled
  }

  setGridHelper(
    visible: boolean,
    length = 30,
    width = 30,
    widthSegments = 30,
    lengthSegments = 30,
  ): void {
    this.requireManager().setGridHelper(
      visible,
      length,
      width,
      widthSegments,
      lengthSegments,
    )
  }

  setAxesHelper(visible: boolean, size = 10): void {
    this.requireManager().setAxesHelper(visible, size)
  }

  loadEnvironment(url: string): Promise<Texture | null> {
    return this.requireManager().loadEnvironment(url)
  }

  clearEnvironment(): void {
    const scene = this.requireManager().scene
    const environment = scene.environment
    scene.background = null
    scene.environment = null
    environment?.dispose()
  }

  getView(): MeteorCameraView {
    return this.requireManager().getView()
  }

  setView(options: MeteorSetViewOptions): Promise<void> {
    return this.requireManager().setView(options)
  }

  getDiagnostics(): MeteorRuntimeDiagnostics {
    const manager = this.requireManager()
    const rendererSize = manager.renderer.getSize(new Vector2())
    const canvasWidth = Math.max(this.canvas.clientWidth, 1)
    const canvasHeight = Math.max(this.canvas.clientHeight, 1)
    const cameraPosition = manager.camera.position

    return {
      sceneManager: !manager.disposed,
      renderer: manager.renderer.domElement === this.canvas,
      camera: manager.camera.isPerspectiveCamera,
      controls: Boolean(manager.controls?.enabled),
      grid: Boolean(manager.gridVisible && manager.gridHelper?.parent === manager.scene),
      resize:
        Math.round(rendererSize.x) === Math.round(canvasWidth) &&
        Math.round(rendererSize.y) === Math.round(canvasHeight) &&
        Math.abs(manager.camera.aspect - canvasWidth / canvasHeight) < 0.001,
      rendererSize: `${Math.round(rendererSize.x)} × ${Math.round(rendererSize.y)}`,
      cameraPosition: [cameraPosition.x, cameraPosition.y, cameraPosition.z],
      threeVersion: `0.${REVISION}.0`,
      sharedThreeInstance:
        Mesh.prototype.raycast === this.raycastAfterCoreImport &&
        functionName(Mesh.prototype.raycast) === 'acceleratedRaycast',
      raycast: {
        beforeCoreImport: functionName(this.raycastBeforeCoreImport),
        afterCoreImport: functionName(this.raycastAfterCoreImport),
        afterManagerInitialization: functionName(this.raycastAfterManagerInitialization),
        changedDuringCoreImport:
          this.raycastAfterCoreImport !== this.raycastBeforeCoreImport,
        differsFromAdapterBaseline:
          this.raycastAfterManagerInitialization !== meshRaycastBeforeFirstCoreImport,
      },
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true

    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.resizeObserverDisconnected = true

    const manager = this.manager
    const webglContext = manager?.renderer.getContext()
    // Core releases the composer targets but not the passes it owns.
    manager?.outlineManager.outlinePass.dispose()
    manager?.outlineManager.outputPass.dispose()
    manager?.outlineManager.renderPass.dispose()
    if (this.pendingModelLoads === 0) this.persistenceManager?.dispose()
    this.persistenceManager = null
    manager?.dispose()
    this.manager = null

    lastDisposeDiagnostics = {
      sceneManagerDisposed: manager?.disposed ?? false,
      resizeObserverDisconnected: this.resizeObserverDisconnected,
      webglContextLost: webglContext?.isContextLost() ?? false,
      raycastRestored: Mesh.prototype.raycast === meshRaycastBeforeFirstCoreImport,
      raycastAfterDispose: functionName(Mesh.prototype.raycast),
    }
  }

  private resize(): void {
    const manager = this.manager
    if (!manager || manager.disposed) return

    const width = Math.max(this.canvas.clientWidth, 1)
    const height = Math.max(this.canvas.clientHeight, 1)
    manager.camera.aspect = width / height
    manager.camera.updateProjectionMatrix()
    manager.renderer.setSize(width, height, false)
    manager.outlineManager.resize(width, height)
  }

  private requireManager(): SceneManagerType {
    if (!this.manager || this.manager.disposed) {
      throw new Error('MeteorScene has not been initialized')
    }
    return this.manager
  }

  private requirePersistenceManager(): PersistenceManagerType {
    if (!this.persistenceManager || this.persistenceManager.disposed) {
      throw new Error('Meteor3D PersistenceManager is not available')
    }
    return this.persistenceManager
  }
}
