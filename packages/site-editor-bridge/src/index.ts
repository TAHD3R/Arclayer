export type { OriginMatcher } from "./origin";
export { isAllowedOrigin, isHttpOrigin } from "./origin";

export type { EditorBridgeOptions, EditorMessageHandler } from "./postMessage";
export { createEditorPostMessageBridge, isHostToPortalMessage, isPortalToHostMessage } from "./postMessage";

export type { EditorRpcClient, EditorRpcClientOptions } from "./rpc";
export { createEditorRpcClient } from "./rpc";

export type {
  EditorHostPenpalConnection,
  EditorHostPenpalOptions,
  EditorPortalPenpalConnection,
  EditorPortalPenpalOptions,
} from "./penpal";
export { connectEditorHostToPortal, connectEditorPortalToHost } from "./penpal";
