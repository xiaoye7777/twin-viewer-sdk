import type { Object3D } from 'three'

export type RuntimeObjectMetadata =
  | { kind: 'assetInstance'; assetRoot: true; assetId: string; instanceId: string; deletedAssetNodeIds: string[] }
  | { kind: 'primitive'; nodeId: string; primitiveType: 'box' | 'plane' | 'cylinder' }

export function setRuntimeMetadata(object: Object3D, metadata: RuntimeObjectMetadata): void { object.userData.editor = metadata }
export function getRuntimeMetadata(object: Object3D): RuntimeObjectMetadata | null {
  const value: unknown = object.userData.editor
  if (!value || typeof value !== 'object' || !('kind' in value)) return null
  if (value.kind === 'assetInstance' && 'instanceId' in value && typeof value.instanceId === 'string' && 'assetId' in value && typeof value.assetId === 'string') return value as RuntimeObjectMetadata
  if (value.kind === 'primitive' && 'nodeId' in value && typeof value.nodeId === 'string' && 'primitiveType' in value) return value as RuntimeObjectMetadata
  return null
}
export function findAssetInstanceRoot(object: Object3D): Object3D | null {
  let current: Object3D | null = object
  while (current) { if (getRuntimeMetadata(current)?.kind === 'assetInstance') return current; current = current.parent }
  return null
}
