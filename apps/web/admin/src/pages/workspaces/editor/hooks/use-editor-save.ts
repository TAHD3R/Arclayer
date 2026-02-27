import * as React from "react";
import { useTranslation } from "react-i18next";

import type { DesignDocumentV1 } from "@celestial/site-block-protocol";

import type { BridgeStatus } from "@/pages/workspaces/editor/hooks/use-editor-bridge";

import {
  publishWorkspaceContentEntry,
  saveWorkspaceContentEntryDraft,
} from "@/api/workspace-content-entries";
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
  editorMode: "page" | "article" | "component";
  /** Retrieve the current document from the Portal iframe (via RPC). */
  getDocument: (() => Promise<DesignDocumentV1 | null>) | null;
  /** Current bridge connection status. */
  bridgeStatus: BridgeStatus;
};

export function useEditorSave(opts: UseEditorSaveOptions) {
  const { workspaceId, entityId, editorMode, getDocument, bridgeStatus } = opts;
  const { t } = useTranslation(["content_pages"]);

  const setSaving = useEditorStore((s) => s.setSaving);
  const setPublishing = useEditorStore((s) => s.setPublishing);
  const setDirty = useEditorStore((s) => s.setDirty);

  const draftRevisionRef = React.useRef<number | null>(null);

  const saveDraft = React.useCallback(
    async (document: DesignDocumentV1) => {
      if (editorMode === "article") {
        notifyInfoText(t("content_pages:EDITOR_SHELL_SAVE_DISABLED_NON_PAGE"));
        return;
      }

      setSaving(true);
      try {
        const out = await saveWorkspaceContentEntryDraft(workspaceId, entityId, {
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
    [editorMode, entityId, setDirty, setSaving, t, workspaceId],
  );

  const publish = React.useCallback(async () => {
    if (editorMode === "article") {
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
        const saved = await saveWorkspaceContentEntryDraft(workspaceId, entityId, {
          document: doc,
          expectedRevision: null,
        });
        draftRevisionRef.current = saved.revision;
        setDirty(false);
      }

      const revision = draftRevisionRef.current;
      const out = await publishWorkspaceContentEntry(
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
  }, [bridgeStatus, editorMode, entityId, getDocument, setDirty, setPublishing, t, workspaceId]);

  return { saveDraft, publish, draftRevisionRef };
}
