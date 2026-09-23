import type { Object3D } from 'three'
import type { TwinBindingTarget } from '@/domain/twin'
import type { MeteorScene } from '@/infrastructure/meteor3d'
import { findAssetInstanceRoot, getRuntimeMetadata } from './runtimeMetadata'

export function bindingTargetFromObject(object: Object3D): TwinBindingTarget | null {
  const own = getRuntimeMetadata(object)
  if (own?.kind === 'primitive') return { type: 'primitive', nodeId: own.nodeId }
  const root = findAssetInstanceRoot(object)
  const meta = root ? getRuntimeMetadata(root) : null
  if (!root || meta?.kind !== 'assetInstance') return null
  if (object === root) return { type: 'asset-instance', instanceId: meta.instanceId }
  const assetNodeId: unknown = object.userData.assetNodeId
  return typeof assetNodeId === 'string' && assetNodeId ? { type: 'asset-node', instanceId: meta.instanceId, assetNodeId } : null
}
export class BindingTargetResolver {
  constructor(private readonly roots: () => readonly Object3D[], private readonly meteor: MeteorScene) {}
  resolve(target: TwinBindingTarget): Object3D | null {
    let object: Object3D | null = null
    if (target.type === 'primitive') object = this.roots().find(root => { const meta = getRuntimeMetadata(root); return meta?.kind === 'primitive' && meta.nodeId === target.nodeId }) ?? null
    else {
      const root = this.roots().find(item => { const meta = getRuntimeMetadata(item); return meta?.kind === 'assetInstance' && meta.instanceId === target.instanceId }) ?? null
      if (!root || target.type === 'asset-instance') object = root
      else root.traverse(node => { if (!object && node.userData.assetNodeId === target.assetNodeId) object = node })
    }
    const bid: unknown = object?.userData.bid
    return typeof bid === 'string' ? this.meteor.findObjectByBid(bid) ?? object : object
  }
}
