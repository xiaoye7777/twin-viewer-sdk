import type { DeepReadonly, DefineComponent } from 'vue'

export type TwinPackageSource = string | URL | Blob | ArrayBuffer | Uint8Array
export type TwinBindingTarget = { type:'asset-instance'; instanceId:string } | { type:'asset-node'; instanceId:string; assetNodeId:string } | { type:'primitive'; nodeId:string }
export interface TwinDevice { id:string; name:string; type?:string }
export interface TwinVariableDefinition { id:string; key:string; name:string; dataType:'number'|'boolean'|'string'; unit?:string }
export interface TwinBinding { id:string; target:TwinBindingTarget; device:TwinDevice; variables:TwinVariableDefinition[] }
export interface TwinRuntimeValue { bindingId:string; variableKey:string; value:number|boolean|string; updatedAt:string }
export type ViewerSelection = Readonly<{ target:Readonly<TwinBindingTarget>; bindingTarget:Readonly<TwinBindingTarget>|null; bindingId:string|null; deviceId:string|null; deviceName:string|null }> | null
export interface ViewerLoadedEvent { projectId:string; projectName:string; objectCount:number; bindingCount:number; warnings:string[] }
export interface ViewerInteractionEvent { eventName:string; interactionId:string; trigger:'click'|'double-click'|'hover-enter'|'hover-leave'; sourceTarget:Readonly<TwinBindingTarget>; triggerTarget:Readonly<TwinBindingTarget>; actionTarget:Readonly<TwinBindingTarget>; deviceId:string|null; metadata:Readonly<Record<string,unknown>> }
export interface ViewerTargetClick { target:TwinBindingTarget; bindingTarget?:TwinBindingTarget; device?:TwinDevice; bindingId?:string }
export type ViewerRuntimeState = DeepReadonly<{ projectId:string|null; bindings:TwinBinding[]; runtimeValues:Record<string,TwinRuntimeValue>; resolutionByBindingId:Record<string,'resolved'|'unresolved'>; bindingRevision:number; runtimeRevision:number; resolutionRevision:number; mockRunning:boolean; mockTickCount:number }> & { getRuntimeValue(bindingId:string,variableKey:string):DeepReadonly<TwinRuntimeValue>|null }
export interface TwinSceneViewerPublicApi { focusDevice(deviceId:string):Promise<boolean>; focusTarget(target:TwinBindingTarget):Promise<boolean>; selectDevice(deviceId:string):boolean; selectTarget(target:TwinBindingTarget):boolean; clearSelection():void; getSelection():ViewerSelection; getRuntimeState():ViewerRuntimeState|null }
export interface LoadedTwinPackage { readonly projectId:string; readonly projectName:string; readonly document:Readonly<SceneDocumentV1>; dispose():void }
export function loadTwinPackage(source:TwinPackageSource,options?:{signal?:AbortSignal}):Promise<LoadedTwinPackage>
export type Vector3Tuple=[number,number,number]
export interface SceneTransformV1 { position:Vector3Tuple; rotation:Vector3Tuple; scale:Vector3Tuple }
export interface SceneNodeOverrideV1 { assetNodeId:string; name:string; transform:SceneTransformV1; runtimeBid?:string; visible?:boolean }
export interface SceneAssetInstanceV1 { assetId:string; instanceId:string; name:string; transform:SceneTransformV1; nodeOverrides:SceneNodeOverrideV1[]; runtimeBid?:string; visible?:boolean; deletedAssetNodeIds?:string[] }
export interface ScenePrimitiveV1 { nodeId:string; type:'box'|'plane'|'cylinder'; name:string; transform:SceneTransformV1; properties:{color:string;width?:number;height?:number;depth?:number;radiusTop?:number;radiusBottom?:number;radialSegments?:number}; runtimeBid?:string; visible?:boolean }
export interface SceneSettingsV1 { gridEnabled:boolean; axesEnabled:boolean; ground:{enabled:boolean;size:number;color:string}; lighting:{ambientIntensity:number;directionalIntensity:number;directionalPosition:Vector3Tuple}; environmentAssetId:string|null }
export interface EffectParameters { color:string; opacity:number; speed:number; padding:number; text:string }
export type EffectKind='box-glow'|'ground-pulse'|'outline'|'child-highlight'|'floating-label'
export interface EffectInstance { id:string; kind:EffectKind; target:TwinBindingTarget; parameters:EffectParameters; sourceTemplateId?:string }
export type RelativeEffectTarget={mode:'current-target'}|{mode:'root-instance'}|{mode:'asset-node';assetNodeId:string}
export interface EffectTemplate { version:1;id:string;origin:'builtin'|'local';name:string;description:string;category:string;effects:{id:string;kind:EffectKind;parameters:EffectParameters;target:RelativeEffectTarget}[] }
export type RuleOperator='>'|'>='|'<'|'<='|'=='|'!='
export type RuleCondition={dataType:'number';operator:RuleOperator;value:number}|{dataType:'boolean';operator:'=='|'!=';value:boolean}|{dataType:'string';operator:'=='|'!=';value:string}
export interface VisualRule { id:string;bindingId:string;target:TwinBindingTarget;variableKey:string;condition:RuleCondition;enabled:boolean;priority:number;template:EffectTemplate|null }
export type InteractionTrigger='click'|'double-click'|'hover-enter'|'hover-leave'
export type InteractionAction={type:'select'|'focus'|'show'|'hide'|'highlight';target?:TwinBindingTarget}|{type:'clear-selection'}|{type:'emit-event';eventName:string;metadata?:Record<string,unknown>}
export interface SceneInteraction { id:string;enabled:boolean;source:TwinBindingTarget;trigger:InteractionTrigger;action:InteractionAction }
export interface SceneDocumentV1 { version:1;projectId:string;metadata:{name?:string;updatedAt:string};instances:SceneAssetInstanceV1[];primitives:ScenePrimitiveV1[];sceneSettings?:SceneSettingsV1;cameraView?:{position:Vector3Tuple;target:Vector3Tuple;fov?:number};bindings?:TwinBinding[];effects?:EffectInstance[];visualRules?:VisualRule[];interactions?:SceneInteraction[] }
export const TwinSceneViewer: DefineComponent<{ source:TwinPackageSource }>
