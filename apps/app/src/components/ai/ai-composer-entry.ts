import {
  type AppendMessage,
  type AttachmentAdapter,
  type CompleteAttachment,
  CompositeAttachmentAdapter,
  type PendingAttachment,
  SimpleTextAttachmentAdapter,
  type ThreadMessageLike,
} from "@assistant-ui/react";

import {
  useAIComposerDirectiveStore,
  type AIComposerDirectiveScope,
} from "@/components/ai/ai-composer-directives";
import type { AssetScopeRef } from "@/lib/assets/asset-scope";
import { uploadSingleAssetFromFile } from "@/lib/assets/scoped-uploads";
import { i18n } from "@/lib/i18n";
import { useAiChatStore } from "@/stores/use-ai-chat-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const WEB_SEARCH_REQUEST_MARKER = "[Web search enabled for this request.]";

function messageContentToText(
  content: AppendMessage["content"] | ThreadMessageLike["content"],
): string {
  return typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((part) => (part.type === "text" ? part.text : "")).join("")
      : "";
}

function completeAttachmentContentToText(attachments: AppendMessage["attachments"]): string {
  const textParts: string[] = [];
  for (const attachment of attachments ?? []) {
    for (const part of attachment.content ?? []) {
      if (part.type === "text" && part.text) textParts.push(part.text);
    }
  }
  return textParts.join("\n\n");
}

export function appendMessageToText(
  message: Pick<AppendMessage, "content" | "attachments">,
): string {
  return [
    messageContentToText(message.content),
    completeAttachmentContentToText(message.attachments),
  ]
    .filter((part) => part.trim())
    .join("\n\n");
}

export function applyWebSearchDirective(text: string): string {
  if (!useAiChatStore.getState().webSearchEnabled) return text;
  return [WEB_SEARCH_REQUEST_MARKER, text].join("\n\n");
}

class StorageImageAttachmentAdapter implements AttachmentAdapter {
  accept = "image/*";

  constructor(private readonly directiveScope: AIComposerDirectiveScope) {}

  async add({ file }: { file: File }): Promise<PendingAttachment> {
    return {
      id: crypto.randomUUID(),
      type: "image",
      name: file.name,
      file,
      contentType: file.type,
      status: { type: "requires-action", reason: "composer-send" },
    };
  }

  async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    const file = attachment.file;
    if (!file) throw new Error("AI_ATTACHMENT_FILE_MISSING");

    const scope = resolveAttachmentUploadScope(this.directiveScope);
    const assetId = await uploadSingleAssetFromFile({
      scope,
      purpose: "attachment",
      file,
      t: (key) => i18n.t(key),
    });
    return {
      id: attachment.id,
      type: "image",
      name: attachment.name,
      contentType: attachment.contentType,
      content: [
        {
          type: "text",
          text: formatUploadedAttachmentReference({
            assetId,
            filename: attachment.name,
            mime: attachment.contentType ?? file.type,
            scope,
          }),
        },
      ],
      status: { type: "complete" },
    };
  }

  async remove(): Promise<void> {}
}

export function createAIChatAttachmentAdapter(scope: AIComposerDirectiveScope) {
  return new CompositeAttachmentAdapter([
    new StorageImageAttachmentAdapter(scope),
    new SimpleTextAttachmentAdapter(),
  ]);
}

function resolveAttachmentUploadScope(scope: AIComposerDirectiveScope): AssetScopeRef {
  const directives = useAIComposerDirectiveStore.getState().directivesByScope[scope];
  const directiveProjectId = directives.find((directive) => directive.type === "project")?.id;
  if (directiveProjectId) return { type: "project", id: directiveProjectId };

  const workspaceState = useWorkspaceStore.getState();
  if (workspaceState.currentProjectId) {
    return { type: "project", id: workspaceState.currentProjectId };
  }
  const workspaceId = workspaceState.currentWorkspaceId;
  if (workspaceId) return { type: "workspace", id: workspaceId };
  throw new Error("AI_ATTACHMENT_SCOPE_REQUIRED");
}

function formatUploadedAttachmentReference(options: {
  assetId: string;
  filename: string;
  mime?: string | null;
  scope: AssetScopeRef;
}): string {
  const mime = options.mime ? `\nMIME: ${options.mime}` : "";
  return [
    `[Uploaded image attachment: ${options.filename}]`,
    `Asset ID: ${options.assetId}`,
    `Scope: ${options.scope.type}:${options.scope.id}`,
    mime.trim(),
  ]
    .filter(Boolean)
    .join("\n");
}

export function projectIdFromComposerDirective(text: string): string | null {
  const match = /:project\[[^\]\n]{1,1024}\]\{name=([^}\n]{1,1024})\}/u.exec(text);
  return match?.[1]?.trim() || null;
}
