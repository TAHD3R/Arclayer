import type { AiEditorContext } from "@/stores/use-ai-chat-store";

export const AI_EDITOR_CONTEXT_ATTACHMENT_TYPE = "editor-context";

/** Agent-facing structured context line attached ahead of the user's message. */
export function formatAiEditorContextPrefix(context: AiEditorContext): string {
  const parts = [`stage=${context.stage}`];
  if (context.pageId) {
    parts.push(`page="${context.pageLabel ?? context.pageId}" pageId=${context.pageId}`);
  }
  if (context.targetKind && context.targetId) {
    parts.push(`target=${context.targetKind} "${context.label}" targetId=${context.targetId}`);
  } else if (context.label) {
    parts.push(`target="${context.label}"`);
  }
  return `[Arclayer editor context] ${parts.join("; ")}`;
}

/** Short chip title, e.g. "Sitemap · 主页 · 英雄头部区". */
export function formatAiEditorContextName(context: AiEditorContext, stageLabel: string): string {
  const segments =
    context.targetKind === "section" && context.pageLabel
      ? [stageLabel, context.pageLabel, context.label]
      : [stageLabel, context.label];
  return segments.join(" · ");
}
