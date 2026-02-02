import type { DocumentIR } from "@celestial/site-block-protocol";

export type EditorProtocolVersion = 1;

export type EditorOverlayMode = "off" | "inspect" | "edit";

export type BlockId = string;

export type RpcRequestId = string;

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
