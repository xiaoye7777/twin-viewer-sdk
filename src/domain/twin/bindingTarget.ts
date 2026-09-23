export type TwinBindingTarget =
  | { type: 'asset-instance'; instanceId: string }
  | { type: 'asset-node'; instanceId: string; assetNodeId: string }
  | { type: 'primitive'; nodeId: string }

export function twinBindingTargetKey(target: TwinBindingTarget): string {
  if (target.type === 'asset-instance') return `asset-instance:${target.instanceId}`
  if (target.type === 'asset-node') return `asset-node:${target.instanceId}:${target.assetNodeId}`
  return `primitive:${target.nodeId}`
}

export function isTwinBindingTarget(value: unknown): value is TwinBindingTarget {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false
  if (value.type === 'asset-instance') {
    return 'instanceId' in value && typeof value.instanceId === 'string' && value.instanceId.length > 0
  }
  if (value.type === 'asset-node') {
    return (
      'instanceId' in value && typeof value.instanceId === 'string' && value.instanceId.length > 0 &&
      'assetNodeId' in value && typeof value.assetNodeId === 'string' && value.assetNodeId.length > 0
    )
  }
  return value.type === 'primitive' && 'nodeId' in value && typeof value.nodeId === 'string' && value.nodeId.length > 0
}
