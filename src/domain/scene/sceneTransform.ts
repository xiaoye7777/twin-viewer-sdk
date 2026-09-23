import type { Object3D } from 'three'
import type { SceneTransformV1 } from './sceneTypes'

export function applySceneTransform(object: Object3D, transform: SceneTransformV1): void {
  object.position.fromArray(transform.position)
  object.rotation.fromArray([...transform.rotation, object.rotation.order])
  object.scale.fromArray(transform.scale)
  object.updateMatrix()
  object.updateMatrixWorld(true)
}
