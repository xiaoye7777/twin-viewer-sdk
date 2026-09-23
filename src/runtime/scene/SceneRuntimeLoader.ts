import { AmbientLight, DirectionalLight, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three'
import type { Object3D } from 'three'
import { applySceneTransform, createDefaultSceneSettings } from '@/domain/scene'
import type { SceneDocumentV1, SceneSettingsV1, SceneCameraViewV1 } from '@/domain/scene'
import type { AssetRepository } from '@/infrastructure/assets'
import type { MeteorScene } from '@/infrastructure/meteor3d'
import { AssetResourceRegistry } from '@/internal/AssetResourceRegistry'
import { setRuntimeMetadata } from '@/internal/runtimeMetadata'
import { createScenePrimitive } from './createScenePrimitive'

export interface SceneRestoreResult {
  roots: Object3D[]
  modifiedObjects: Object3D[]
  warnings: string[]
}

/** Shared document interpreter. No stores, editing actions or DOM listeners. */
export class SceneRuntimeLoader {
  private disposed = false
  private ambient: AmbientLight | null = null
  private directional: DirectionalLight | null = null
  private ground: Mesh<PlaneGeometry, MeshStandardMaterial> | null = null
  private environmentId: string | null | undefined
  private environmentQueue: Promise<void> = Promise.resolve()
  environmentStatus = 'None'

  constructor(
    private readonly runtime: MeteorScene,
    private readonly assets: AssetRepository,
    readonly resources = new AssetResourceRegistry(),
  ) {}

  private assertActive(): void {
    if (this.disposed) throw new DOMException('Scene loading cancelled', 'AbortError')
  }

  async restore(document: SceneDocumentV1): Promise<SceneRestoreResult> {
    this.assertActive()
    const roots: Object3D[] = []
    const modifiedObjects: Object3D[] = []
    const warnings: string[] = []
    for (const saved of document.primitives) {
      const object = createScenePrimitive(saved.type, saved)
      if (!this.runtime.addObject(object)) throw new Error(`无法恢复 Primitive ${saved.name}`)
      roots.push(object)
    }
    for (const instance of document.instances) {
      try {
        const asset = await this.assets.get(instance.assetId)
        this.assertActive()
        if (!asset) throw new Error(`缺少资产 ${instance.assetId}`)
        const model = await this.runtime.loadGLTFModel(this.resources.getOrCreate(asset).objectUrl)
        this.assertActive()
        model.name = instance.name
        setRuntimeMetadata(model, {
          kind: 'assetInstance', assetRoot: true, assetId: instance.assetId,
          instanceId: instance.instanceId, deletedAssetNodeIds: [...(instance.deletedAssetNodeIds ?? [])],
        })
        const nodes = new Map<string, Object3D>()
        model.traverse((node) => {
          // Preserve original poses for Editor reset without involving an Editor store.
          node.userData.editorInitialTransform = {
            position: node.position.toArray(),
            rotation: [node.rotation.x, node.rotation.y, node.rotation.z],
            scale: node.scale.toArray(),
          }
          if (typeof node.userData.assetNodeId === 'string') nodes.set(node.userData.assetNodeId, node)
        })
        applySceneTransform(model, instance.transform)
        if (instance.runtimeBid) model.userData.bid = instance.runtimeBid
        for (const override of instance.nodeOverrides) {
          const node = nodes.get(override.assetNodeId)
          if (!node) { warnings.push(`缺少模型节点 ${instance.instanceId}/${override.assetNodeId}`); continue }
          node.name = override.name
          applySceneTransform(node, override.transform)
          node.visible = override.visible ?? true
          if (override.runtimeBid) node.userData.bid = override.runtimeBid
          modifiedObjects.push(node)
        }
        for (const id of instance.deletedAssetNodeIds ?? []) nodes.get(id)?.removeFromParent()
        model.visible = instance.visible ?? true
        if (!this.runtime.addObject(model)) throw new Error(`无法恢复模型 ${instance.name}`)
        roots.push(model)
      } catch (error) {
        this.assertActive()
        warnings.push(`${instance.instanceId}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    try { await this.applySettings(document.sceneSettings ?? createDefaultSceneSettings()) }
    catch (error) {
      this.assertActive()
      warnings.push(error instanceof Error ? error.message : String(error))
    }
    this.assertActive()
    if (document.cameraView) await this.restoreCamera(document.cameraView)
    this.assertActive()
    return { roots, modifiedObjects, warnings }
  }

  applySettings(settings: SceneSettingsV1): Promise<void> {
    this.assertActive()
    const scene = this.runtime.getScene()
    if (!this.ambient) {
      this.ambient = new AmbientLight(0xffffff)
      this.ambient.name = 'Editor Ambient Light'
      this.directional = new DirectionalLight(0xffffff)
      this.directional.name = 'Editor Directional Light'
      const geometry = new PlaneGeometry(1, 1)
      geometry.rotateX(-Math.PI / 2)
      this.ground = new Mesh(geometry, new MeshStandardMaterial({ roughness: 0.92, metalness: 0 }))
      this.ground.name = 'Editor Ground'
      this.ground.position.y = -0.01
      this.ground.receiveShadow = true
      for (const object of [this.ambient, this.directional, this.ground]) {
        object.userData.editorInfrastructure = true
        scene.add(object)
      }
    }
    const size = Math.max(1, settings.ground.size)
    const segments = Math.max(1, Math.min(200, Math.round(size / 10)))
    this.runtime.setGridHelper(settings.gridEnabled, size, size, segments, segments)
    this.runtime.setAxesHelper(settings.axesEnabled, Math.max(5, Math.min(50, size / 10)))
    this.ambient.intensity = settings.lighting.ambientIntensity
    this.directional!.intensity = settings.lighting.directionalIntensity
    this.directional!.position.fromArray(settings.lighting.directionalPosition)
    this.ground!.visible = settings.ground.enabled
    this.ground!.scale.set(settings.ground.size, 1, settings.ground.size)
    this.ground!.material.color.set(settings.ground.color)
    this.ground!.updateMatrixWorld(true)
    const id = settings.environmentAssetId
    const task = this.environmentQueue.then(async () => {
      this.assertActive()
      if (this.environmentId === id) return
      if (!id) {
        this.runtime.clearEnvironment()
        this.environmentId = null
        this.environmentStatus = 'None'
        return
      }
      const asset = await this.assets.get(id)
      this.assertActive()
      if (!asset || asset.assetType !== 'environment') throw new Error('保存的环境资产不存在或类型不正确')
      const texture = await this.runtime.loadEnvironment(this.resources.getOrCreate(asset).objectUrl)
      this.assertActive()
      if (!texture) throw new Error('环境贴图加载失败')
      this.environmentId = id
      this.environmentStatus = asset.name
    }).catch((error: unknown) => {
      if (!this.disposed) {
        this.runtime.clearEnvironment()
        this.environmentId = undefined
        this.environmentStatus = 'Fallback'
      }
      throw error
    })
    this.environmentQueue = task.catch(() => {})
    return task
  }

  async restoreCamera(view: SceneCameraViewV1): Promise<void> {
    this.assertActive()
    const camera = this.runtime.getCamera()
    if (view.fov !== undefined) { camera.fov = view.fov; camera.updateProjectionMatrix() }
    await this.runtime.setView({
      position: { x: view.position[0], y: view.position[1], z: view.position[2] },
      target: { x: view.target[0], y: view.target[1], z: view.target[2] }, duration: 0,
    })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.resources.dispose()
    // Objects and environment belong to MeteorScene; its dispose frees them.
  }
}
