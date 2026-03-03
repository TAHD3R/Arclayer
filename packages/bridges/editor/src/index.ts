export type { OriginMatcher } from "./origin";
export { isAllowedOrigin, isHttpOrigin } from "./origin";

export { buildEditorIframeHref, normalizePathname } from "./url";

export type { EditorHostConnector } from "./host-connector";
export { createEditorHostConnector } from "./host-connector";

export type { EditorBridgeOptions, EditorMessageHandler } from "./postMessage";
export {
  createEditorPostMessageBridge,
  isHostToPortalMessage,
  isPortalToHostMessage,
} from "./postMessage";

export type { EditorRpcClient, EditorRpcClientOptions } from "./rpc";
export { createEditorRpcClient } from "./rpc";

export type {
  EditorHostPenpalConnection,
  EditorHostPenpalOptions,
  EditorPortalPenpalConnection,
  EditorPortalPenpalOptions,
} from "./penpal";
export { connectEditorHostToPortal, connectEditorPortalToHost } from "./penpal";
