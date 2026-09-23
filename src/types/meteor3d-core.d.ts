declare module '@meteor3d/core' {
  import type {
    Intersection,
    Object3D,
    PerspectiveCamera,
    Scene,
    Vector2,
    WebGLRenderer,
    Texture,
  } from 'three'

  interface MeteorOrbitControls {
    enabled: boolean
  }


  interface MeteorViewPoint {
    x: number
    y: number
    z: number
  }

  interface MeteorCameraView {
    position: MeteorViewPoint
    target: MeteorViewPoint
  }

  export class SceneManager {
    constructor(canvas: HTMLCanvasElement)

    canvas: HTMLCanvasElement | null
    disposed: boolean
    scene: Scene
    camera: PerspectiveCamera
    renderer: WebGLRenderer
    controls: MeteorOrbitControls
    gridHelper: Object3D | null
    gridVisible: boolean
    outlineManager: {
      resize(width: number, height: number): void
      outlinePass: { dispose(): void }
      outputPass: { dispose(): void }
      renderPass: { dispose(): void }
    }
    enableOutline(bid: string, options?: { color?: number; thickness?: number; strength?: number }): boolean
    disableOutline(bid?: string): boolean

    addObject<T extends Object3D>(object: T): boolean
    removeObject(object: Object3D): void
    findObjectByBid<T extends Object3D = Object3D>(bid: string): T | null
    raycastObjects(
      screenPosition: Vector2,
      options?: { recursive?: boolean; includeTileMap?: boolean },
    ): Intersection<Object3D>[]
    raycastGround(screenPosition: Vector2): import('three').Vector3 | null
    setGridHelper(
      visible: boolean,
      length?: number,
      width?: number,
      widthSegments?: number,
      lengthSegments?: number,
    ): void
    setAxesHelper(visible: boolean, size?: number): void
    loadEnvironment(url: string): Promise<Texture | null>
    getView(callback?: (view: MeteorCameraView) => void): MeteorCameraView
    setView(options: MeteorCameraView & { duration?: number }): Promise<void>
    focusObject(bid: string, options?: Record<string, unknown>): Promise<void>
    fitCameraToScene(): Promise<void>
    dispose(): void
  }

  export class PersistenceManager {
    constructor(
      sceneManager: SceneManager,
      editorStore?: unknown,
      dbManager?: unknown,
      options?: { dracoPath?: string },
    )

    disposed: boolean
    loadGLTFModel(
      url: string,
      options?: {
        assignBids?: boolean
        assetId?: string
        assetVersionId?: string
      },
    ): Promise<Object3D>
    dispose(): void
  }
}
