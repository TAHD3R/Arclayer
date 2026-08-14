"use client";

import { AttachmentPrimitive, ComposerPrimitive, useAuiState } from "@assistant-ui/react";
import { MapPinIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AI_EDITOR_CONTEXT_ATTACHMENT_TYPE } from "@/components/ai/ai-editor-context";
import { Button } from "@arclayer/ui/button";

function EditorContextChip() {
  const { t } = useTranslation("ai");
  return (
    <AttachmentPrimitive.Root className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/40 bg-primary/[0.06] py-1 pr-1.5 pl-2 text-caption font-semibold text-label-primary">
      <MapPinIcon className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 truncate">
        <AttachmentPrimitive.Name />
      </span>
      <AttachmentPrimitive.Remove asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("AI_CHAT_EDITOR_CONTEXT_CLEAR")}
          className="size-5 rounded-full p-0 text-label-tertiary hover:bg-muted hover:text-label-primary"
        >
          <XIcon className="size-3" aria-hidden="true" />
        </Button>
      </AttachmentPrimitive.Remove>
    </AttachmentPrimitive.Root>
  );
}

/**
 * Removable editor-context chips inside the composer, built on the assistant-ui
 * composer attachment primitives (`type === "editor-context"`).
 */
export function AIComposerEditorContextChips() {
  const attachments = useAuiState((state) => state.composer.attachments);

  const editorIndexes = (attachments ?? [])
    .map((attachment, index) => ({ attachment, index }))
    .filter(({ attachment }) => attachment.type === AI_EDITOR_CONTEXT_ATTACHMENT_TYPE)
    .map(({ index }) => index);

  if (editorIndexes.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 px-1" data-ai-editor-context-chips>
      {editorIndexes.map((index) => (
        <ComposerPrimitive.AttachmentByIndex
          key={index}
          index={index}
          components={{ Attachment: EditorContextChip }}
        />
      ))}
    </div>
  );
}
