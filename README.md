# @twin-studio/viewer

Vue 3 运行态组件，用于直接加载 Twin Studio 导出的 `.twin.zip`。组件恢复 SceneDocument、GLB/HDR、设备绑定、Mock 实时数据、原子特效、可视化规则和交互配置。

```ts
import { TwinSceneViewer } from '@twin-studio/viewer'
import '@twin-studio/viewer/style.css'
```

```vue
<TwinSceneViewer ref="viewer" source="/zero-carbon-demo.twin.zip" @selection-change="handleSelection" />
```

宿主只使用 `deviceId` 和 `TwinBindingTarget`，不需要接触 Three.js、Meteor3D 或 Editor Store。

默认使用内置 Mock 数据源。独立 Dashboard 可以切换为 WebSocket JSON：

```vue
<TwinSceneViewer
  source="/zero-carbon-demo.twin.zip"
  :data-source="{ type: 'websocket', url: 'ws://127.0.0.1:8787' }"
/>
```

消息以 `deviceId` 定位 Binding，其余字段按场景中已有变量 key 和 dataType 写入同一份 RuntimeValue：

```json
{"deviceId":"ESS-003","soc":72,"temperature":75,"power":108,"alarm":true,"status":"running"}
```

`getRuntimeState()` 的 `dataSourceType`、`dataSourceStatus`、`dataSourceMessageCount` 和 `dataSourceError` 可供宿主展示连接状态。也可调用 `setDataSource()` 在不重载场景的情况下切换 Mock/WebSocket；SDK 会先停止旧数据源，避免两者同时写入。
