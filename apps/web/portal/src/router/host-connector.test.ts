import { describe, expect, it, vi } from "vitest";

import { createEditorHostConnector } from "@celestial/site-editor-bridge";

describe("site-editor-bridge/host-connector (imported via Portal)", () => {
  it("connect() calls onConnected and exposes portal proxy", async () => {
    const destroy = vi.fn();
    const portal = { getProtocolVersion: vi.fn(async () => 1 as const) } as any;

    const connectImpl = vi.fn(async () => ({ portal, destroy }));
    const onConnected = vi.fn();

    const connector = createEditorHostConnector({
      iframe: {} as any,
      methods: {} as any,
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
    const portal1 = { getProtocolVersion: vi.fn(async () => 1 as const) } as any;
    const portal2 = { getProtocolVersion: vi.fn(async () => 1 as const) } as any;

    const connectImpl = vi
      .fn()
      .mockResolvedValueOnce({ portal: portal1, destroy: destroy1 })
      .mockResolvedValueOnce({ portal: portal2, destroy: destroy2 });

    const connector = createEditorHostConnector({
      iframe: {} as any,
      methods: {} as any,
      connectImpl,
    });

    await connector.connect();
    await connector.connect();
    expect(destroy1).toHaveBeenCalledTimes(1);
    expect(connector.getPortal()).toBe(portal2);
  });

  it("connect() ignores protocol mismatch", async () => {
    const destroy = vi.fn();
    const portal = { getProtocolVersion: vi.fn(async () => 1 as const) } as any;
    const connectImpl = vi.fn(async () => ({ portal, destroy }));

    const connector = createEditorHostConnector({
      iframe: {} as any,
      methods: {} as any,
      expectedProtocolVersion: 999 as any,
      connectImpl,
    });

    await connector.connect();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(connector.getPortal()).toBe(null);
  });

  it("connect({silent:true}) suppresses onError", async () => {
    const onError = vi.fn();
    const connectImpl = vi.fn(async () => {
      throw new Error("boom");
    });

    const connector = createEditorHostConnector({
      iframe: {} as any,
      methods: {} as any,
      connectImpl,
      onError,
    });

    await connector.connect({ silent: true });
    expect(onError).toHaveBeenCalledTimes(0);
  });
});
