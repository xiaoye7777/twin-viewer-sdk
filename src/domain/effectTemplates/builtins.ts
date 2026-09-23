import { createEffectParameters, type EffectKind } from '@/domain/effects'
import type { EffectTemplate } from './index'

function preset(id: string, name: string, kinds: EffectKind[], color: string, category: string): EffectTemplate {
  return { version: 1, id: `builtin:${id}`, origin: 'builtin', name, description: '内置只读方案，可复制为自定义模板', category,
    effects: kinds.map((kind, index) => ({ id: `${id}:${index}`, kind, target: { mode: 'current-target' }, parameters: { ...createEffectParameters(), color, text: name } })) }
}
export function getBuiltinTemplates(): EffectTemplate[] {
  return [
    preset('critical', '严重告警', ['box-glow', 'ground-pulse', 'outline', 'floating-label'], '#ff3030', '告警'),
    preset('warning', '高温预警', ['box-glow', 'floating-label'], '#ff9900', '告警'),
    preset('selected', '设备选中', ['outline'], '#ffb020', '高亮'),
  ]
}
