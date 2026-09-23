import type { SceneDocumentV1 } from '@/domain/scene'
import type { AssetType } from '@/infrastructure/assets/AssetRepository'

export const PACKAGE_FORMAT = 'twin-studio-project'
export const PACKAGE_VERSION = 1
export const PACKAGE_LIMITS = { zipBytes: 256 * 1024 ** 2, totalBytes: 256 * 1024 ** 2, fileBytes: 128 * 1024 ** 2, jsonBytes: 8 * 1024 ** 2, files: 512 }

export interface PackageAsset {
  id: string
  path: string
  name: string
  mimeType: string
  assetType: AssetType
  size: number
  sha256: string
  lastModified: number
  createdAt: string
}
export interface PackageManifest {
  format: typeof PACKAGE_FORMAT
  packageVersion: 1
  exportedAt: string
  project: { id: string; name: string; createdAt: string; updatedAt: string }
  scene: { path: 'scene.json'; sha256: string }
  assets: PackageAsset[]
}

/** Explicit schema dependencies. Rules embed recipes; effects/interactions have no assets. */
export function collectSceneAssets(scene: SceneDocumentV1): Map<string, AssetType> {
  const result = new Map<string, AssetType>()
  for (const instance of scene.instances) result.set(instance.assetId, 'model')
  const environment = scene.sceneSettings?.environmentAssetId
  if (environment) {
    if (result.has(environment)) throw new Error('同一资产不能同时作为模型和环境')
    result.set(environment, 'environment')
  }
  return result
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer)
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
export function json(bytes: Uint8Array | undefined, label: string): unknown {
  if (!bytes || bytes.length > PACKAGE_LIMITS.jsonBytes) throw new Error(`${label} 缺失或超过大小限制`)
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
  catch { throw new Error(`${label} 不是有效 JSON` ) }
}

export function validateManifest(value: unknown): asserts value is PackageManifest {
  if (!record(value) || value.format !== PACKAGE_FORMAT) throw new Error('不是 Twin Studio 项目包')
  if (value.packageVersion !== PACKAGE_VERSION) throw new Error(`不支持的 packageVersion: ${String(value.packageVersion)}`)
  const p = value.project, s = value.scene
  if (!record(p) || typeof p.id !== 'string' || !p.id || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 200 ||
    typeof p.createdAt !== 'string' || !Number.isFinite(Date.parse(p.createdAt)) || typeof p.updatedAt !== 'string' || !Number.isFinite(Date.parse(p.updatedAt)) ||
    !record(s) || s.path !== 'scene.json' || typeof s.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(s.sha256) || !Array.isArray(value.assets)) throw new Error('manifest 项目或场景信息无效')
  const ids = new Set<string>(), paths = new Set<string>()
  for (const a of value.assets) {
    if (!record(a) || typeof a.id !== 'string' || !a.id || typeof a.path !== 'string' || !/^assets\/[0-9]+\.(glb|hdr)$/.test(a.path) ||
      typeof a.name !== 'string' || !a.name || /[\\/\x00-\x1f]/.test(a.name) || a.name.length > 255 ||
      (a.assetType !== 'model' && a.assetType !== 'environment') || typeof a.mimeType !== 'string' ||
      typeof a.size !== 'number' || !Number.isSafeInteger(a.size) || a.size <= 0 || a.size > PACKAGE_LIMITS.fileBytes ||
      typeof a.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(a.sha256) || typeof a.lastModified !== 'number' || !Number.isFinite(a.lastModified) ||
      typeof a.createdAt !== 'string' || !Number.isFinite(Date.parse(a.createdAt))) throw new Error('manifest 资产信息无效')
    const extension = a.assetType === 'model' ? '.glb' : '.hdr'
    if (!a.path.endsWith(extension) || !a.name.toLowerCase().endsWith(extension) || a.mimeType !== (a.assetType === 'model' ? 'model/gltf-binary' : 'image/vnd.radiance')) throw new Error('资产文件类型不匹配')
    if (ids.has(a.id) || paths.has(a.path)) throw new Error('manifest 包含重复资产')
    ids.add(a.id); paths.add(a.path)
  }
}
