<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { TwinBindingTarget } from '@/domain/twin'
import type { TwinSceneViewerEvents, TwinSceneViewerPublicApi } from './viewerContract'
import { loadTwinPackage, type LoadedTwinPackage, type TwinPackageSource } from '@/infrastructure/package/PortableTwinPackageLoader'
import { TwinSceneRuntime } from '@/runtime/twin/TwinSceneRuntime'
import type { ViewerTargetClick } from '@/runtime/twin/ViewerPointerEvents'
import type { ViewerDataSourceConfig } from '@/infrastructure/data'

const props = withDefaults(defineProps<{ source: TwinPackageSource; dataSource?: ViewerDataSourceConfig }>(), {
  dataSource: () => ({ type: 'mock' }),
})
const emit = defineEmits<TwinSceneViewerEvents>()
const canvas = ref<HTMLCanvasElement>()
const canvasKey = ref(0)
const session = shallowRef<TwinSceneRuntime | null>(null)
const loadedPackage = shallowRef<LoadedTwinPackage | null>(null)
const loading = ref(false)
const error = ref('')
const warnings = ref<string[]>([])
let mounted = false
let generation = 0
let controller: AbortController | null = null

function release(): void {
  controller?.abort(); controller = null
  session.value?.dispose(); session.value = null
  loadedPackage.value?.dispose(); loadedPackage.value = null
}
async function load(): Promise<void> {
  const request = ++generation
  release()
  canvasKey.value += 1
  await nextTick()
  if (!mounted || request !== generation || !canvas.value) return
  error.value = ''; warnings.value = []; loading.value = true
  controller = new AbortController()
  try {
    const portable = await loadTwinPackage(props.source, { signal: controller.signal })
    if (!mounted || request !== generation) { portable.dispose(); return }
    loadedPackage.value = portable
    const runtime = new TwinSceneRuntime(canvas.value, portable.sceneRepository, portable.assetRepository, (event) => {
      if (!mounted || request !== generation) return
      const payload: ViewerTargetClick = { ...event, target: { ...event.target }, bindingTarget: event.bindingTarget ? { ...event.bindingTarget } : undefined,
        device: event.device ? { ...event.device } : undefined }
      emit('target-click', payload); if (payload.device) emit('device-click', payload)
    }, selection => { if (mounted && request === generation) emit('selection-change', selection) },
    event => { if (mounted && request === generation) emit('interaction-event', event) }, props.dataSource)
    session.value = runtime
    const result = await runtime.load(portable.projectId)
    if (!mounted || request !== generation) return
    warnings.value = result
    emit('loaded', { projectId: portable.projectId, projectName: portable.projectName, objectCount: runtime.roots.length,
      bindingCount: runtime.twin.bindings.length, warnings: result })
  } catch (cause) {
    if (request !== generation || (cause instanceof DOMException && cause.name === 'AbortError')) return
    error.value = cause instanceof Error ? cause.message : String(cause); emit('error', error.value)
  } finally { if (request === generation) { loading.value = false; controller = null } }
}
onMounted(() => { mounted = true; void load() })
watch(() => props.source, () => { if (mounted) void load() })
watch(() => props.dataSource, value => { session.value?.setDataSource(value) }, { deep: true })
onBeforeUnmount(() => { mounted = false; generation++; release() })

const publicApi: TwinSceneViewerPublicApi = {
  focusTarget: (target: TwinBindingTarget) => session.value?.focusTarget(target) ?? Promise.resolve(false),
  focusDevice: (id: string) => session.value?.focusDevice(id) ?? Promise.resolve(false),
  selectDevice: (id: string) => session.value?.selectDevice(id) ?? false,
  selectTarget: (target: TwinBindingTarget) => session.value?.selectTarget(target) ?? false,
  clearSelection: () => session.value?.clearSelection(),
  getSelection: () => session.value?.getSelection() ?? null,
  getRuntimeState: () => session.value?.runtimeState ?? null,
  setDataSource: (config: ViewerDataSourceConfig) => session.value?.setDataSource(config) ?? false,
  getDiagnostics: () => session.value?.getDiagnostics() ?? {
    dataSource: { type: props.dataSource.type, status: 'disconnected', messageCount: 0, error: null },
    visualRules: { activations: 0, activeRules: 0 },
    effects: { effects: 0, transientOwners: 0, helpers: 0, outlined: 0 },
  },
}
defineExpose(publicApi)
</script>

<template>
  <div class="twin-viewer" data-testid="twin-scene-viewer" :data-loaded="!loading && !error && !!session"
    :data-object-count="session?.roots.length ?? 0" :data-binding-count="session?.twin.bindings.length ?? 0"
    :data-mock-running="session?.twin.mockRunning ?? false" :data-mock-ticks="session?.twin.mockTickCount ?? 0"
    :data-source-type="session?.twin.dataSourceType ?? props.dataSource.type"
    :data-source-status="session?.twin.dataSourceStatus ?? 'disconnected'"
    :data-source-messages="session?.twin.dataSourceMessageCount ?? 0"
    :data-active-visual-rules="session?.visualRules?.getDiagnostics().activeRules ?? 0"
    :data-effect-helpers="session?.effects?.getDiagnostics().helpers ?? 0">
    <canvas :key="canvasKey" ref="canvas" class="twin-viewer__canvas" aria-label="数字孪生场景" />
    <div v-if="loading || error" role="status" class="twin-viewer__overlay">{{ error || '正在加载项目包…' }}</div>
    <div v-else-if="warnings.length" role="status" class="twin-viewer__warning">{{ warnings.join('；') }}</div>
  </div>
</template>

<style>
.twin-viewer{position:relative;width:100%;height:100%;min-height:0;overflow:hidden;background:#0f172a}.twin-viewer__canvas{display:block;width:100%;height:100%}.twin-viewer__overlay{position:absolute;inset:0;display:grid;place-items:center;padding:2rem;background:rgba(2,6,23,.78);color:#e2e8f0;font:14px/1.5 system-ui,sans-serif}.twin-viewer__warning{position:absolute;left:.75rem;bottom:.75rem;max-width:28rem;border-radius:.4rem;padding:.5rem .75rem;background:rgba(69,26,3,.86);color:#fde68a;font:12px/1.5 system-ui,sans-serif}
</style>
