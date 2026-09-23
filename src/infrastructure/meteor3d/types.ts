export interface RaycastSideEffectDiagnostics {
  beforeCoreImport: string
  afterCoreImport: string
  afterManagerInitialization: string
  changedDuringCoreImport: boolean
  differsFromAdapterBaseline: boolean
}

export interface MeteorRuntimeDiagnostics {
  sceneManager: boolean
  renderer: boolean
  camera: boolean
  controls: boolean
  grid: boolean
  resize: boolean
  rendererSize: `${number} × ${number}`
  cameraPosition: readonly [number, number, number]
  threeVersion: string
  sharedThreeInstance: boolean
  raycast: RaycastSideEffectDiagnostics
}

export interface MeteorDisposeDiagnostics {
  sceneManagerDisposed: boolean
  resizeObserverDisconnected: boolean
  webglContextLost: boolean
  raycastRestored: boolean
  raycastAfterDispose: string
}

export interface MeteorRaycastOptions {
  recursive?: boolean
  includeTileMap?: boolean
}

export interface MeteorViewPoint {
  x: number
  y: number
  z: number
}

export interface MeteorCameraView {
  position: MeteorViewPoint
  target: MeteorViewPoint
}

export interface MeteorSetViewOptions extends MeteorCameraView {
  duration?: number
}
