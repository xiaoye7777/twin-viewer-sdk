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
