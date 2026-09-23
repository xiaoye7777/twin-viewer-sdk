import { isSceneDocumentV1, type SceneDocumentV1 } from '@/domain/scene'
import type { AssetMetadata, AssetRecord, AssetRepository } from '@/infrastructure/assets'
import type { SceneRepository } from '@/runtime/scene/SceneRepository'
import { collectSceneAssets, json, PACKAGE_LIMITS, sha256, validateManifest, type PackageManifest } from './packageFormat'
import { readPackageZip } from './packageZip'
import { validatePortableAsset } from './validatePortableAsset'

export type TwinPackageSource = string | URL | Blob | ArrayBuffer | Uint8Array

class PackageSceneRepository implements SceneRepository {
  constructor(private readonly document: SceneDocumentV1) {}
  async load(projectId: string): Promise<SceneDocumentV1 | null> { return projectId === this.document.projectId ? structuredClone(this.document) : null }
  async save(): Promise<void> { throw new Error('Portable package scene is read-only') }
  dispose(): void { this.document.instances = []; this.document.primitives = []; this.document.bindings = [] }
}
class PackageAssetRepository implements AssetRepository {
  constructor(private readonly records: Map<string, AssetRecord>) {}
  async get(id: string): Promise<AssetRecord | null> { return this.records.get(id) ?? null }
  async listMetadata(): Promise<AssetMetadata[]> { return [...this.records.values()].map(({ blob: _blob, fingerprint: _fingerprint, lastModified: _lastModified, ...metadata }) => metadata) }
  async saveFile(): Promise<AssetRecord> { throw new Error('Portable package assets are read-only') }
  dispose(): void { this.records.clear() }
}

export interface LoadedTwinPackage {
  readonly manifest: PackageManifest
  readonly projectId: string
  readonly projectName: string
  readonly document: Readonly<SceneDocumentV1>
  readonly sceneRepository: SceneRepository
  readonly assetRepository: AssetRepository
  dispose(): void
}

async function bytesFrom(source: TwinPackageSource, signal?: AbortSignal): Promise<Uint8Array> {
  if (typeof source === 'string' || source instanceof URL) {
    const response = await fetch(source, { signal })
    if (!response.ok) throw new Error(`项目包下载失败：HTTP ${response.status}`)
    const size = Number(response.headers.get('content-length') ?? 0)
    if (size > PACKAGE_LIMITS.zipBytes) throw new Error('ZIP 超过 256 MiB 限制')
    return new Uint8Array(await response.arrayBuffer())
  }
  if (source instanceof Blob) return new Uint8Array(await source.arrayBuffer())
  if (source instanceof Uint8Array) return source
  return new Uint8Array(source)
}

export async function loadTwinPackage(source: TwinPackageSource, options: { signal?: AbortSignal } = {}): Promise<LoadedTwinPackage> {
  const bytes = await bytesFrom(source, options.signal)
  if (bytes.length > PACKAGE_LIMITS.zipBytes) throw new Error('ZIP 超过 256 MiB 限制')
  const files = readPackageZip(bytes)
  const manifestValue = json(files.get('manifest.json'), 'manifest.json')
  validateManifest(manifestValue)
  const manifest = manifestValue
  const sceneBytes = files.get(manifest.scene.path)
  if (!sceneBytes || await sha256(sceneBytes) !== manifest.scene.sha256) throw new Error('scene.json 校验失败')
  const sceneValue = json(sceneBytes, 'scene.json')
  if (!isSceneDocumentV1(sceneValue)) throw new Error('SceneDocument 损坏或 version 不受支持')
  if (sceneValue.projectId !== manifest.project.id) throw new Error('manifest 与 SceneDocument 项目 ID 不一致')
  const dependencies = collectSceneAssets(sceneValue)
  if (files.size !== manifest.assets.length + 2 || dependencies.size !== manifest.assets.length) throw new Error('包内资产与场景依赖不一致')
  const records = new Map<string, AssetRecord>()
  for (const asset of manifest.assets) {
    const data = files.get(asset.path)
    if (!data || data.length !== asset.size || dependencies.get(asset.id) !== asset.assetType) throw new Error(`缺少引用资产或大小/类型不一致: ${asset.name}`)
    if (await sha256(data) !== asset.sha256) throw new Error(`资产校验失败: ${asset.name}`)
    validatePortableAsset(data, asset.assetType)
    records.set(asset.id, { id: asset.id, fingerprint: `package:${asset.sha256}`, name: asset.name, mimeType: asset.mimeType,
      size: asset.size, lastModified: asset.lastModified, createdAt: asset.createdAt, assetType: asset.assetType,
      blob: new Blob([new Uint8Array(data).buffer], { type: asset.mimeType }) })
  }
  const scene = structuredClone(sceneValue)
  const sceneRepository = new PackageSceneRepository(scene)
  const assetRepository = new PackageAssetRepository(records)
  let disposed = false
  return Object.freeze({
    manifest: structuredClone(manifest), projectId: scene.projectId, projectName: manifest.project.name,
    document: structuredClone(scene), sceneRepository, assetRepository,
    dispose() { if (disposed) return; disposed = true; sceneRepository.dispose(); assetRepository.dispose() },
  })
}
