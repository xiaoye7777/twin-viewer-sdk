import type { SceneDocumentV1 } from '@/domain/scene'
export interface SceneRepository {
  save(document: SceneDocumentV1): Promise<void>
  load(projectId: string): Promise<SceneDocumentV1 | null>
}
