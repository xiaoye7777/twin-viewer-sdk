import type { SceneSettingsV1 } from './sceneTypes'

export function createDefaultSceneSettings(): SceneSettingsV1 {
  return {
    gridEnabled: true,
    axesEnabled: false,
    ground: {
      enabled: true,
      size: 200,
      color: '#26313f',
    },
    lighting: {
      ambientIntensity: 1.3,
      directionalIntensity: 2.4,
      directionalPosition: [5, 8, 4],
    },
    environmentAssetId: null,
  }
}

export function cloneSceneSettings(settings: SceneSettingsV1): SceneSettingsV1 {
  return {
    gridEnabled: settings.gridEnabled,
    axesEnabled: settings.axesEnabled,
    ground: { ...settings.ground },
    lighting: {
      ...settings.lighting,
      directionalPosition: [...settings.lighting.directionalPosition],
    },
    environmentAssetId: settings.environmentAssetId,
  }
}
