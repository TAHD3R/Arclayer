import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { ScrollArea } from "@arclayer/ui/scroll-area";
import type { BuilderRevisionGlobalSectionOut, BuilderRevisionPageOut } from "@arclayer/openapi";
import { Globe2, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AiEditorContext } from "@/stores/use-ai-chat-store";
import { collectSitemapSectionRows } from "@/pages/projects/editor/sitemap-section-rows";

interface SitemapStageInspectorProps {
  page: BuilderRevisionPageOut | null;
  selectedSectionId: string | null;
  globalSections: readonly BuilderRevisionGlobalSectionOut[];
  globalInstanceCounts: ReadonlyMap<string, number>;
  canEdit: boolean;
  onRenamePage: (pageId: string, title: string) => void;
  onClearSection: () => void;
  onClose: () => void;
  onOpenAI: (context?: AiEditorContext) => void;
}

export function SitemapStageInspector({
  page,
  selectedSectionId,
  globalSections,
  globalInstanceCounts,
  canEdit,
  onRenamePage,
  onClearSection,
  onClose,
  onOpenAI,
}: SitemapStageInspectorProps) {
  const { t } = useTranslation("account");
  const row = page
    ? collectSitemapSectionRows(page, globalSections).find((item) => item.id === selectedSectionId)
    : undefined;

  return (
    <aside
      aria-label={t("CREATION_EDITOR_SITEMAP_INSPECTOR_LABEL")}
      className="flex w-[360px] shrink-0 flex-col border-l border-border bg-background"
      data-testid="sitemap-stage-inspector"
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
        <p className="truncate text-footnote font-semibold text-label-primary">
          {row
            ? t("CREATION_EDITOR_SITEMAP_INSPECTOR_SECTION")
            : page
              ? t("CREATION_EDITOR_SITEMAP_INSPECTOR_PAGE")
              : t("CREATION_EDITOR_SITEMAP_INSPECTOR_LABEL")}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("CREATION_EDITOR_SITEMAP_INSPECTOR_CLOSE")}
          onClick={() => {
            onClearSection();
            onClose();
          }}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
      {!page ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
          <p className="max-w-56 text-footnote leading-relaxed text-label-secondary">
            {t("CREATION_EDITOR_SITEMAP_INSPECTOR_EMPTY")}
          </p>
        </div>
      ) : row ? (
        <SectionPanel
          page={page}
          sectionId={row.id}
          title={row.title}
          description={row.description}
          globalTitle={row.globalTitle}
          globalReferenceId={row.globalReferenceId}
          globalInstanceCounts={globalInstanceCounts}
          onOpenAI={onOpenAI}
        />
      ) : (
        <PagePanel page={page} canEdit={canEdit} onRenamePage={onRenamePage} onOpenAI={onOpenAI} />
      )}
    </aside>
  );
}

function PagePanel({
  page,
  canEdit,
  onRenamePage,
  onOpenAI,
}: {
  page: BuilderRevisionPageOut;
  canEdit: boolean;
  onRenamePage: (pageId: string, title: string) => void;
  onOpenAI: (context?: AiEditorContext) => void;
}) {
  const { t } = useTranslation("account");
  const [draft, setDraft] = useState(page.title);
  useEffect(() => setDraft(page.title), [page.itemId, page.title]);
  const route = page.routes?.find((route) => route.isActive)?.path ?? page.routes?.[0]?.path;
  const commit = () => {
    const nextTitle = draft.trim();
    if (canEdit && nextTitle && nextTitle !== page.title) onRenamePage(page.itemId, nextTitle);
  };
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-5 p-4">
        <div>
          <p className="text-caption font-semibold text-label-primary">
            {t("CREATION_EDITOR_SITEMAP_INSPECTOR_NAME")}
          </p>
          <Input
            value={draft}
            aria-label={t("CREATION_EDITOR_SITEMAP_INSPECTOR_NAME")}
            disabled={!canEdit}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
            }}
            className="mt-2"
          />
        </div>
        {route ? (
          <div>
            <p className="text-caption font-semibold text-label-primary">
              {t("CREATION_EDITOR_SITEMAP_INSPECTOR_ROUTE")}
            </p>
            <p className="mt-1 font-mono text-footnote text-label-secondary">{route}</p>
          </div>
        ) : null}
        {page.purpose || page.summary ? (
          <div>
            <p className="text-caption font-semibold text-label-primary">
              {t("CREATION_EDITOR_SITEMAP_INSPECTOR_DESCRIPTION")}
            </p>
            <p className="mt-1 text-footnote leading-relaxed text-label-secondary">
              {page.purpose ?? page.summary}
            </p>
            <p className="mt-2 text-caption leading-relaxed text-label-tertiary">
              {t("CREATION_EDITOR_SITEMAP_INSPECTOR_DESCRIPTION_HINT")}
            </p>
          </div>
        ) : (
          <p className="text-footnote leading-relaxed text-label-secondary">
            {t("CREATION_EDITOR_SITEMAP_INSPECTOR_DESCRIPTION_HINT")}
          </p>
        )}
        <Button
          className="w-full"
          onClick={() =>
            onOpenAI({
              stage: "sitemap",
              pageId: page.itemId,
              pageLabel: page.title,
              targetKind: "page",
              targetId: page.itemId,
              label: page.title,
            })
          }
        >
          <Sparkles className="size-4" aria-hidden="true" />
          {t("CREATION_EDITOR_SITEMAP_INSPECTOR_ASK_PAGE")}
        </Button>
      </div>
    </ScrollArea>
  );
}

function SectionPanel({
  page,
  sectionId,
  title,
  description,
  globalTitle,
  globalReferenceId,
  globalInstanceCounts,
  onOpenAI,
}: {
  page: BuilderRevisionPageOut;
  sectionId: string;
  title: string;
  description: string | null;
  globalTitle: string | null;
  globalReferenceId: string | null;
  globalInstanceCounts: ReadonlyMap<string, number>;
  onOpenAI: (context?: AiEditorContext) => void;
}) {
  const { t } = useTranslation("account");
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-5 p-4">
        <div>
          <p className="text-caption font-semibold text-label-primary">
            {t("CREATION_EDITOR_SITEMAP_INSPECTOR_SECTION_TITLE")}
          </p>
          <p className="mt-1 text-body font-semibold text-label-primary">{title}</p>
        </div>
        {description ? (
          <div>
            <p className="text-caption font-semibold text-label-primary">
              {t("CREATION_EDITOR_SITEMAP_INSPECTOR_DESCRIPTION")}
            </p>
            <p className="mt-1 text-footnote leading-relaxed text-label-secondary">{description}</p>
          </div>
        ) : null}
        {globalReferenceId ? (
          <div className="rounded-lg border border-primary/35 bg-primary/[0.05] p-3">
            <p className="flex items-center gap-1.5 text-caption font-semibold text-primary">
              <Globe2 className="size-3.5" aria-hidden="true" />
              {t("CREATION_EDITOR_SITEMAP_INSPECTOR_GLOBAL_SOURCE")}
            </p>
            <p className="mt-1 text-footnote text-label-secondary">
              {globalTitle ?? globalReferenceId}
            </p>
            <p className="mt-1 text-caption text-label-tertiary">
              {t("CREATION_EDITOR_SITEMAP_ADD_SECTION_INSTANCES", {
                count: globalInstanceCounts.get(globalReferenceId) ?? 0,
              })}
            </p>
          </div>
        ) : null}
        <Button
          className="w-full"
          onClick={() =>
            onOpenAI({
              stage: "sitemap",
              pageId: page.itemId,
              pageLabel: page.title,
              targetKind: "section",
              targetId: sectionId,
              label: title,
            })
          }
        >
          <Sparkles className="size-4" aria-hidden="true" />
          {t("CREATION_EDITOR_SITEMAP_INSPECTOR_ASK_SECTION")}
        </Button>
      </div>
    </ScrollArea>
  );
}
