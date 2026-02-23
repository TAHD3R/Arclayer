import { describe, expect, it, vi } from "vitest";

import {
  createEditorHostConnector,
  type EditorHostPenpalConnection,
  type EditorHostPenpalOptions,
} from "@celestial/site-editor-bridge";
import type { EditorProtocolVersion, HostEditorRpcApi } from "@celestial/site-editor-protocol";

function createPortalStub(): EditorHostPenpalConnection["portal"] {
  return {
    getProtocolVersion: vi.fn(async () => 1 as EditorProtocolVersion),
  } as unknown as EditorHostPenpalConnection["portal"];
}

function createHostMethodsStub(): HostEditorRpcApi {
  return {} as unknown as HostEditorRpcApi;
}

describe("site-editor-bridge/host-connector (imported via Portal)", () => {
  it("connect() calls onConnected and exposes portal proxy", async () => {
    const destroy = vi.fn();
    const portal = createPortalStub();

    const connectImpl = vi.fn(
      async (): Promise<EditorHostPenpalConnection> => ({ portal, destroy }),
    );
    const onConnected = vi.fn();

    const connector = createEditorHostConnector({
      iframe: {} as unknown as HTMLIFrameElement,
      methods: createHostMethodsStub(),
      connectImpl,
      onConnected,
    });

    await connector.connect();
    expect(connectImpl).toHaveBeenCalledTimes(1);
    expect(onConnected).toHaveBeenCalledTimes(1);
    expect(connector.getPortal()).toBe(portal);
  });

  it("connect() destroys previous connection when called again", async () => {
    const destroy1 = vi.fn();
    const destroy2 = vi.fn();
    const portal1 = createPortalStub();
    const portal2 = createPortalStub();

    const connectImpl = vi
      .fn<(args: EditorHostPenpalOptions) => Promise<EditorHostPenpalConnection>>()
      .mockResolvedValueOnce({ portal: portal1, destroy: destroy1 })
      .mockResolvedValueOnce({ portal: portal2, destroy: destroy2 });

    const connector = createEditorHostConnector({
      iframe: {} as unknown as HTMLIFrameElement,
      methods: createHostMethodsStub(),
      connectImpl,
    });

    await connector.connect();
    await connector.connect();
    expect(destroy1).toHaveBeenCalledTimes(1);
    expect(connector.getPortal()).toBe(portal2);
  });

  it("connect() ignores protocol mismatch", async () => {
    const destroy = vi.fn();
    const portal = createPortalStub();
    const connectImpl = vi.fn(
      async (): Promise<EditorHostPenpalConnection> => ({ portal, destroy }),
    );

    const connector = createEditorHostConnector({
      iframe: {} as unknown as HTMLIFrameElement,
      methods: createHostMethodsStub(),
      expectedProtocolVersion: 999 as unknown as EditorProtocolVersion,
      connectImpl,
    });

    await connector.connect();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(connector.getPortal()).toBe(null);
  });

  it("connect({silent:true}) suppresses onError", async () => {
    const onError = vi.fn();
    const connectImpl = vi.fn(async (): Promise<EditorHostPenpalConnection> => {
      throw new Error("boom");
    });

    const connector = createEditorHostConnector({
      iframe: {} as unknown as HTMLIFrameElement,
      methods: createHostMethodsStub(),
      connectImpl,
      onError,
    });

    await connector.connect({ silent: true });
    expect(onError).toHaveBeenCalledTimes(0);
  });
});
