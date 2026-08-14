import { Sparkles, SquarePen } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { Textarea } from "@arclayer/ui/textarea";

import { EditorFloatingCard } from "@/pages/projects/editor/editor-floating-card";
import { useAiChatStore } from "@/stores/use-ai-chat-store";
import { useAIEntryStore } from "@/stores/use-ai-entry-store";

export type SitemapPagePromptPlacement = "root" | "before" | "after";

export interface SitemapPagePromptTarget {
  placement: SitemapPagePromptPlacement;
  /** Adjacent page label for before/after inserts; project name at root. */
  neighborLabel: string | null;
  /** Adjacent page id, attached to the AI editor context. */
  neighborId: string | null;
}

interface SitemapPagePromptPanelProps {
  open: boolean;
  anchor: HTMLElement | null;
  onOpenChange: (open: boolean) => void;
  target: SitemapPagePromptTarget | null;
  onBlankCreate: () => void;
  blankCreatePending: boolean;
}

/**
 * Relume-style "describe the page" floating card: the requirement text is
 * handed to the AI assistant, which plans the page and its sections.
 */
export function SitemapPagePromptPanel({
  open,
  anchor,
  onOpenChange,
  target,
  onBlankCreate,
  blankCreatePending,
}: SitemapPagePromptPanelProps) {
  const { t } = useTranslation("account");
  const [requirement, setRequirement] = useState("");

  const placementLabel = resolvePlacementLabel(
    t,
    target?.placement ?? "root",
    target?.neighborLabel ?? null,
  );

  const submitToAI = () => {
    const trimmed = requirement.trim();
    if (!trimmed) return;
    const prompt =
      target && target.placement !== "root"
        ? t("CREATION_EDITOR_SITEMAP_PAGE_PROMPT_AI_AT", {
            page: target.neighborLabel ?? "",
            position: t(
              target.placement === "before"
                ? "CREATION_EDITOR_SITEMAP_PAGE_PROMPT_BEFORE"
                : "CREATION_EDITOR_SITEMAP_PAGE_PROMPT_AFTER",
            ),
            requirements: trimmed,
          })
        : t("CREATION_EDITOR_SITEMAP_PAGE_PROMPT_AI", { requirements: trimmed });
    setRequirement("");
    onOpenChange(false);
    useAIEntryStore.getState().submit(prompt);
    useAiChatStore.getState().openDrawer({
      stage: "sitemap",
      targetKind: "page",
      pageId: target?.neighborId ?? undefined,
      pageLabel: target?.neighborLabel ?? undefined,
      targetId: target?.neighborId ?? undefined,
      label: target?.neighborLabel ?? "",
    });
  };

  return (
    <EditorFloatingCard
      open={open}
      anchor={anchor}
      onOpenChange={onOpenChange}
      title={t("CREATION_EDITOR_SITEMAP_PAGE_PROMPT_TITLE")}
      description={placementLabel}
      widthClass="w-[min(30rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            disabled={blankCreatePending}
            onClick={() => {
              setRequirement("");
              onOpenChange(false);
              onBlankCreate();
            }}
          >
            <SquarePen className="size-4" aria-hidden="true" />
            {t("CREATION_EDITOR_SITEMAP_PAGE_PROMPT_BLANK")}
          </Button>
          <Button type="button" disabled={!requirement.trim()} onClick={submitToAI}>
            <Sparkles className="size-4" aria-hidden="true" />
            {t("CREATION_EDITOR_SITEMAP_PAGE_PROMPT_AI_ACTION")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2 px-4 py-4">
        <label
          htmlFor="sitemap-page-prompt-requirement"
          className="text-caption font-medium text-label-secondary"
        >
          {t("CREATION_EDITOR_SITEMAP_PAGE_PROMPT_FIELD")}
        </label>
        <Textarea
          id="sitemap-page-prompt-requirement"
          value={requirement}
          onChange={(event) => setRequirement(event.target.value)}
          placeholder={t("CREATION_EDITOR_SITEMAP_PAGE_PROMPT_PLACEHOLDER")}
          className="min-h-28"
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submitToAI();
          }}
        />
        <p className="text-caption text-label-tertiary">
          {t("CREATION_EDITOR_SITEMAP_PAGE_PROMPT_HINT")}
        </p>
      </div>
    </EditorFloatingCard>
  );
}

function resolvePlacementLabel(
  t: (key: string, values?: Record<string, unknown>) => string,
  placement: SitemapPagePromptPlacement,
  neighborLabel: string | null,
) {
  if (placement === "root") return t("CREATION_EDITOR_SITEMAP_PAGE_PROMPT_DESC");
  return t("CREATION_EDITOR_SITEMAP_PAGE_PROMPT_AT_DESC", {
    page: neighborLabel ?? "",
    position: t(
      placement === "before"
        ? "CREATION_EDITOR_SITEMAP_PAGE_PROMPT_BEFORE"
        : "CREATION_EDITOR_SITEMAP_PAGE_PROMPT_AFTER",
    ),
  });
}
