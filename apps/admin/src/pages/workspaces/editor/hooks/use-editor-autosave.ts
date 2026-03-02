import * as React from "react";

import type { PageBlueprint } from "@celestial/site-block-protocol";

import type { BridgeStatus } from "@/pages/workspaces/editor/hooks/use-editor-bridge";
import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";
import { getErrorMessage, notifyErrorText } from "@/lib/notifications";

export type UseEditorAutoSaveOptions = {
  enabled: boolean;
  intervalSec: number;
  saveOnBlur: boolean;
  isPageMode: boolean;
  bridgeStatus: BridgeStatus;
  getDocument: (() => Promise<PageBlueprint | null>) | null;
  saveDraft: (doc: PageBlueprint) => Promise<void>;
};

function clampIntervalMs(sec: number): number {
  const ms = Math.round(Number(sec) * 1000);
  if (!Number.isFinite(ms)) return 30_000;
  return Math.max(10_000, Math.min(300_000, ms));
}

export function useEditorAutoSave(opts: UseEditorAutoSaveOptions) {
  const isDirty = useEditorStore((s) => s.isDirty);
  const isSaving = useEditorStore((s) => s.isSaving);
  const isPublishing = useEditorStore((s) => s.isPublishing);

  const latestRef = React.useRef({
    ...opts,
    isDirty,
    isSaving,
    isPublishing,
  });

  React.useEffect(() => {
    latestRef.current = {
      ...opts,
      isDirty,
      isSaving,
      isPublishing,
    };
  }, [isDirty, isPublishing, isSaving, opts]);

  const savingRef = React.useRef(false);
  const lastToastAtRef = React.useRef(0);

  const tryAutoSave = React.useCallback(async (_reason: "interval" | "blur" | "hidden") => {
    const {
      enabled,
      isPageMode,
      bridgeStatus,
      getDocument,
      saveDraft,
      isDirty: dirty,
      isSaving: saving,
      isPublishing: publishing,
    } = latestRef.current;

    if (!enabled || !isPageMode) return;
    if (!dirty || saving || publishing) return;
    if (!getDocument) return;
    if (bridgeStatus !== "connected") return;
    if (savingRef.current) return;

    savingRef.current = true;
    try {
      const doc = await getDocument();
      if (!doc) return;
      await saveDraft(doc);
    } catch (err) {
      // Auto-save should be non-intrusive: avoid toast spam.
      const now = Date.now();
      if (now - lastToastAtRef.current > 30_000) {
        lastToastAtRef.current = now;
        notifyErrorText(getErrorMessage(err));
      }
    } finally {
      savingRef.current = false;
    }
  }, []);

  React.useEffect(() => {
    if (!opts.enabled || !opts.isPageMode) return;
    const timer = window.setInterval(() => {
      void tryAutoSave("interval");
    }, clampIntervalMs(opts.intervalSec));

    return () => window.clearInterval(timer);
  }, [opts.enabled, opts.intervalSec, opts.isPageMode, tryAutoSave]);

  React.useEffect(() => {
    if (!opts.enabled || !opts.isPageMode || !opts.saveOnBlur) return;

    const onBlur = () => {
      void tryAutoSave("blur");
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void tryAutoSave("hidden");
      }
    };

    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [opts.enabled, opts.isPageMode, opts.saveOnBlur, tryAutoSave]);

  return { tryAutoSave };
}
