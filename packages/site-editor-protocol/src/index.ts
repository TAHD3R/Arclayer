import type { DocumentIR } from "@celestial/site-block-protocol";

export type EditorProtocolVersion = 1;

export type EditorOverlayMode = "off" | "inspect" | "edit";

export type BlockId = string;

export type RpcRequestId = string;

export type EditorPresence = {
  siteId: string;
  pathname: string;
  overlayMode: EditorOverlayMode;
  selectedBlockId: BlockId | null;
  hasDraftOverride: boolean;
  updatedAtMs: number;
};

export type PortalEditorMessageEnvelope<T extends string, Payload> = {
  version: EditorProtocolVersion;
  type: T;
  requestId?: RpcRequestId;
  payload: Payload;
};

// Admin -> Portal (iframe)
export type HostToPortalMessage =
  | PortalEditorMessageEnvelope<
      "PING",
      {
        sentAt: number;
      }
    >
  | PortalEditorMessageEnvelope<
      "SET_OVERLAY_MODE",
      {
        mode: EditorOverlayMode;
      }
    >
  | PortalEditorMessageEnvelope<
      "SELECT_BLOCK",
      {
        blockId: BlockId | null;
      }
    >
  | PortalEditorMessageEnvelope<
      "PUSH_DRAFT_DOCUMENT",
      {
        document: DocumentIR;
      }
    >;

// Portal (iframe) -> Admin
export type PortalToHostMessage =
  | PortalEditorMessageEnvelope<
      "READY",
      {
        readyAt: number;
      }
    >
  | PortalEditorMessageEnvelope<
      "PONG",
      {
        receivedAt: number;
      }
    >
  | PortalEditorMessageEnvelope<
      "SELECTION_CHANGED",
      {
        blockId: BlockId | null;
      }
    >;

export type AnyEditorMessage = HostToPortalMessage | PortalToHostMessage;

/**
 * Penpal RPC APIs (Sprint 2+).
 *
 * We keep the message-based protocol for debugging and low-level transports,
 * but prefer method-based RPC between Admin(host) and Portal(iframe) for readability.
 */
export type PortalEditorRpcApi = {
  getProtocolVersion: () => EditorProtocolVersion;
  ping: (args: { sentAt: number }) => { receivedAt: number };
  setOverlayMode: (args: { mode: EditorOverlayMode }) => void;
  selectBlock: (args: { blockId: BlockId | null }) => void;
  /**
   * Push a draft document override for instant preview.
   *
   * When `pathname` is provided, the portal editor mode may ignore the update
   * if it doesn't match the currently rendered route. This prevents accidental
   * cross-page draft overwrites when the host shell navigates quickly.
   */
  pushDraftDocument: (args: { document: DocumentIR; pathname?: string }) => void;
};

export type HostEditorRpcApi = {
  ready: (args: { readyAt: number }) => void;
  selectionChanged: (args: { blockId: BlockId | null }) => void;

  /**
   * Portal notifies the host that a save should happen (e.g. Cmd+S inside the iframe).
   *
   * Sprint 2: stub-only. The host decides what "save" means.
   */
  requestSave: (args: { siteId: string; pathname: string; document: DocumentIR }) => void;

  /**
   * Presence channel (stub): allow the portal iframe to report editor presence
   * without coupling the host UI to portal internals.
   */
  reportPresence: (args: { presence: EditorPresence }) => void;
};
