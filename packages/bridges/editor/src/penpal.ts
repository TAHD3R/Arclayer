import { connectToChild, connectToParent } from "penpal";
import type { AsyncMethodReturns } from "penpal";

import type { HostEditorRpcApi, PortalEditorRpcApi } from "@celestial/editor-protocol";

export type EditorHostPenpalOptions = {
  iframe: HTMLIFrameElement;
  methods: HostEditorRpcApi;
  childOrigin?: string;
  timeoutMs?: number;
  debug?: boolean;
};

export type EditorHostPenpalConnection = {
  portal: AsyncMethodReturns<PortalEditorRpcApi>;
  destroy: () => void;
};

export async function connectEditorHostToPortal(
  opts: EditorHostPenpalOptions,
): Promise<EditorHostPenpalConnection> {
  // With `exactOptionalPropertyTypes`, we omit optional keys instead of passing `undefined`.
  const connection = connectToChild<PortalEditorRpcApi>({
    iframe: opts.iframe,
    methods: opts.methods,
    ...(opts.childOrigin ? { childOrigin: opts.childOrigin } : {}),
    ...(opts.timeoutMs ? { timeout: opts.timeoutMs } : {}),
    ...(opts.debug !== undefined ? { debug: opts.debug } : {}),
  });

  const portal = await connection.promise;
  return { portal, destroy: () => connection.destroy() };
}

export type EditorPortalPenpalOptions = {
  methods: PortalEditorRpcApi;
  parentOrigin?: string | RegExp;
  timeoutMs?: number;
  debug?: boolean;
};

export type EditorPortalPenpalConnection = {
  host: AsyncMethodReturns<HostEditorRpcApi>;
  destroy: () => void;
};

export async function connectEditorPortalToHost(
  opts: EditorPortalPenpalOptions,
): Promise<EditorPortalPenpalConnection> {
  // With `exactOptionalPropertyTypes`, we omit optional keys instead of passing `undefined`.
  const connection = connectToParent<HostEditorRpcApi>({
    methods: opts.methods,
    ...(opts.parentOrigin ? { parentOrigin: opts.parentOrigin } : {}),
    ...(opts.timeoutMs ? { timeout: opts.timeoutMs } : {}),
    ...(opts.debug !== undefined ? { debug: opts.debug } : {}),
  });

  const host = await connection.promise;
  return { host, destroy: () => connection.destroy() };
}
