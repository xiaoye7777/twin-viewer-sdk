import { BoxGeometry, CylinderGeometry, PlaneGeometry, Mesh, MeshStandardMaterial } from 'three'
import { applySceneTransform, type ScenePrimitiveV1 } from '@/domain/scene'
import { setRuntimeMetadata } from '@/internal/runtimeMetadata'

export function createScenePrimitive(type: ScenePrimitiveV1['type'], saved?: ScenePrimitiveV1): Mesh {
  const color = saved?.properties.color ?? (type === 'plane' ? 0x64748b : type === 'cylinder' ? 0x10b981 : 0x3b82f6)
  let geometry: BoxGeometry | PlaneGeometry | CylinderGeometry
  if (type === 'plane') {
    geometry = new PlaneGeometry(saved?.properties.width ?? 10, saved?.properties.height ?? 10)
    geometry.rotateX(-Math.PI / 2)
  } else if (type === 'cylinder') {
    const height = saved?.properties.height ?? 1
    geometry = new CylinderGeometry(
      saved?.properties.radiusTop ?? 0.5,
      saved?.properties.radiusBottom ?? 0.5,
      height,
      saved?.properties.radialSegments ?? 32,
    )
    geometry.translate(0, height / 2, 0)
  } else {
    const width = saved?.properties.width ?? 1
    const height = saved?.properties.height ?? 1
    const depth = saved?.properties.depth ?? 1
    geometry = new BoxGeometry(width, height, depth)
    geometry.translate(0, height / 2, 0)
  }

  const object = new Mesh(
    geometry,
    new MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05 }),
  )
  object.name = saved?.name ?? (type === 'box' ? 'Box' : type === 'plane' ? 'Plane' : 'Cylinder')
  setRuntimeMetadata(object, {
    kind: 'primitive',
    nodeId: saved?.nodeId ?? `node_${globalThis.crypto.randomUUID()}`,
    primitiveType: type,
  })
  if (saved) {
    applySceneTransform(object, saved.transform)
    if (saved.runtimeBid) object.userData.bid = saved.runtimeBid
  }
  object.visible = saved?.visible ?? true
  object.userData.editorInitialTransform = {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  }
  return object
}
