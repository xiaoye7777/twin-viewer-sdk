import type { AssetRecord } from '@/infrastructure/assets'

export class AssetResourceRegistry {
  private readonly urls = new Map<string, string>()
  getOrCreate(asset: AssetRecord): { objectUrl: string } {
    let objectUrl = this.urls.get(asset.id)
    if (!objectUrl) { objectUrl = URL.createObjectURL(asset.blob); this.urls.set(asset.id, objectUrl) }
    return { objectUrl }
  }
  dispose(): void { for (const url of this.urls.values()) URL.revokeObjectURL(url); this.urls.clear() }
}
