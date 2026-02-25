import * as React from "react";
import { useTranslation } from "react-i18next";

import type { DocumentIR } from "@celestial/site-block-protocol";

import type { BridgeStatus } from "@/pages/workspaces/editor/hooks/use-editor-bridge";

import { publishWorkspaceSitePage, saveWorkspaceSitePageDraft } from "@/api/workspace-site";
import {
  getErrorMessage,
  notifyErrorText,
  notifyInfoText,
  notifySuccessText,
} from "@/lib/notifications";
import { formatWorkspaceEditorSaveError } from "@/pages/workspaces/editor/workspace-editor-errors";
import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";

export type UseEditorSaveOptions = {
  workspaceId: string;
  entityId: string;
  isPageMode: boolean;
  /** Retrieve the current document from the Portal iframe (via RPC). */
  getDocument: (() => Promise<DocumentIR | null>) | null;
  /** Current bridge connection status. */
  bridgeStatus: BridgeStatus;
};

export function useEditorSave(opts: UseEditorSaveOptions) {
  const { workspaceId, entityId, isPageMode, getDocument, bridgeStatus } = opts;
  const { t } = useTranslation(["content_pages"]);

  const setSaving = useEditorStore((s) => s.setSaving);
  const setPublishing = useEditorStore((s) => s.setPublishing);
  const setDirty = useEditorStore((s) => s.setDirty);

  const draftRevisionRef = React.useRef<number | null>(null);

  const saveDraft = React.useCallback(
    async (document: DocumentIR) => {
      if (!isPageMode) {
        notifyInfoText(t("content_pages:EDITOR_SHELL_SAVE_DISABLED_NON_PAGE"));
        return;
      }

      setSaving(true);
      try {
        const out = await saveWorkspaceSitePageDraft(workspaceId, entityId, {
          document,
          expectedRevision: draftRevisionRef.current,
        });
        draftRevisionRef.current = out.revision;
        setDirty(false);
      } catch (err) {
        notifyErrorText(formatWorkspaceEditorSaveError(err, t));
      } finally {
        setSaving(false);
      }
    },
    [entityId, isPageMode, setDirty, setSaving, t, workspaceId],
  );

  const publish = React.useCallback(async () => {
    if (!isPageMode) {
      notifyInfoText(t("content_pages:EDITOR_SHELL_PUBLISH_DISABLED_NON_PAGE"));
      return;
    }

    if (bridgeStatus !== "connected") {
      notifyErrorText(t("content_pages:EDITOR_SHELL_PUBLISH_BRIDGE_NOT_READY"));
      return;
    }

    setPublishing(true);
    try {
      // No draft yet — save the current document first so there is something to publish.
      if (draftRevisionRef.current === null && getDocument) {
        const doc = await getDocument();
        if (!doc) {
          notifyErrorText(t("content_pages:EDITOR_SHELL_PUBLISH_GET_DOCUMENT_FAILED"));
          return;
        }
        const saved = await saveWorkspaceSitePageDraft(workspaceId, entityId, {
          document: doc,
          expectedRevision: null,
        });
        draftRevisionRef.current = saved.revision;
        setDirty(false);
      }

      const revision = draftRevisionRef.current;
      const out = await publishWorkspaceSitePage(
        workspaceId,
        entityId,
        revision === null ? {} : { revision },
      );
      notifySuccessText(
        t("content_pages:EDITOR_SHELL_PUBLISH_SUCCESS", { revision: out.revision }),
      );
    } catch (err) {
      notifyErrorText(getErrorMessage(err));
    } finally {
      setPublishing(false);
    }
  }, [bridgeStatus, entityId, getDocument, isPageMode, setDirty, setPublishing, t, workspaceId]);

  // Cmd/Ctrl+S keyboard shortcut — triggers save via bridge
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!getDocument) return;
        void (async () => {
          try {
            const doc = await getDocument();
            if (!doc) {
              notifyErrorText(t("content_pages:EDITOR_SHELL_IFRAME_EMPTY"));
              return;
            }
            await saveDraft(doc);
          } catch (err) {
            notifyErrorText(getErrorMessage(err));
          }
        })();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [getDocument, saveDraft, t]);

  return { saveDraft, publish, draftRevisionRef };
}
