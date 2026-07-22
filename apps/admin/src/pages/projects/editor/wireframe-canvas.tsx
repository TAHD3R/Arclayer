import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import { ScrollArea } from "@arclayer/ui/scroll-area";
import type { BuilderRevisionPageOut, WireframeSectionV1Output } from "@arclayer/openapi";
import { Monitor, PanelsTopLeft, Smartphone, Tablet, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { BaseTag } from "@/components/ui/tags";
import { WireframePageRail } from "@/pages/projects/editor/wireframe-page-rail";

type WireframeViewport = "desktop" | "tablet" | "mobile";

const VIEWPORT_WIDTH_CLASS: Record<WireframeViewport, string> = {
  desktop: "max-w-[920px]",
  tablet: "max-w-[680px]",
  mobile: "max-w-[390px]",
};

interface WireframeCanvasProps {
  pages: BuilderRevisionPageOut[];
  selectedPageId: string | null;
  onSelectPage: (pageId: string) => void;
  selectedSectionId: string | null;
  onSelectSection: (sectionId: string | null) => void;
  reviewPanel?: ReactNode;
  candidateActive?: boolean;
}

export function WireframeCanvas({
  pages,
  selectedPageId,
  onSelectPage,
  selectedSectionId,
  onSelectSection,
  reviewPanel,
  candidateActive = false,
}: WireframeCanvasProps) {
  const { t } = useTranslation("account");
  const [viewport, setViewport] = useState<WireframeViewport>("desktop");
  const page = pages.find((candidate) => candidate.itemId === selectedPageId) ?? pages[0] ?? null;
  const sections = page?.wireframe?.sections ?? [];

  useEffect(() => {
    if (selectedSectionId && sections.some((section) => section.id === selectedSectionId)) return;
    onSelectSection(sections[0]?.id ?? null);
  }, [onSelectSection, sections, selectedSectionId]);

  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 bg-muted/25"
      aria-label={t("CREATION_EDITOR_WIREFRAME_CANVAS_LABEL")}
    >
      <WireframePageRail
        pages={pages}
        selectedPageId={page?.itemId ?? null}
        onSelectPage={onSelectPage}
      />
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <CanvasGrid />
        <div className="absolute top-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-background p-1 shadow-sm">
          <ViewportButton
            viewport="desktop"
            current={viewport}
            icon={Monitor}
            label={t("CREATION_EDITOR_WIREFRAME_VIEWPORT_DESKTOP")}
            onChange={setViewport}
          />
          <ViewportButton
            viewport="tablet"
            current={viewport}
            icon={Tablet}
            label={t("CREATION_EDITOR_WIREFRAME_VIEWPORT_TABLET")}
            onChange={setViewport}
          />
          <ViewportButton
            viewport="mobile"
            current={viewport}
            icon={Smartphone}
            label={t("CREATION_EDITOR_WIREFRAME_VIEWPORT_MOBILE")}
            onChange={setViewport}
          />
        </div>

        <ScrollArea className="relative h-full">
          <div className="mx-auto flex min-h-full w-full items-start justify-center px-10 pt-20 pb-16">
            {!page ? (
              <WireframeEmpty
                title={t("CREATION_EDITOR_WIREFRAME_PAGE_REQUIRED_TITLE")}
                description={t("CREATION_EDITOR_WIREFRAME_PAGE_REQUIRED_DESC")}
              />
            ) : !page.wireframe ? (
              <WireframeEmpty
                title={t("CREATION_EDITOR_WIREFRAME_EMPTY_TITLE")}
                description={t("CREATION_EDITOR_WIREFRAME_EMPTY_DESC")}
              />
            ) : (
              <article
                className={cn(
                  "w-full overflow-hidden rounded-xl border border-border bg-background shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-[max-width] duration-150 motion-reduce:transition-none",
                  VIEWPORT_WIDTH_CLASS[viewport],
                )}
                aria-label={t("CREATION_EDITOR_WIREFRAME_PAGE_FRAME", { page: page.title })}
              >
                <header className="flex items-start justify-between gap-6 border-b border-border px-6 py-5">
                  <div className="min-w-0">
                    <p className="text-caption font-medium text-label-secondary">
                      {t("CREATION_EDITOR_WIREFRAME_PAGE_LABEL")}
                    </p>
                    <h2 className="mt-1 truncate text-title-3 font-semibold text-label-primary">
                      {page.title}
                    </h2>
                  </div>
                  <BaseTag>
                    {t(
                      candidateActive
                        ? "CREATION_EDITOR_WIREFRAME_CANDIDATE_ACTIVE"
                        : "CREATION_EDITOR_WIREFRAME_REVISION_PINNED",
                    )}
                  </BaseTag>
                </header>
                {sections.length > 0 ? (
                  <ol className="relative space-y-4 px-6 py-6 before:absolute before:top-8 before:bottom-8 before:left-9 before:w-px before:bg-border">
                    {sections.map((section, index) => (
                      <WireframeSection
                        key={section.id}
                        section={section}
                        index={index}
                        selected={selectedSectionId === section.id}
                        onSelect={() => onSelectSection(section.id)}
                      />
                    ))}
                  </ol>
                ) : (
                  <div className="px-6 py-12">
                    <WireframeEmpty
                      title={t("CREATION_EDITOR_WIREFRAME_SECTIONS_EMPTY_TITLE")}
                      description={t("CREATION_EDITOR_WIREFRAME_SECTIONS_EMPTY_DESC")}
                      compact
                    />
                  </div>
                )}
              </article>
            )}
          </div>
        </ScrollArea>
        {reviewPanel}
      </div>
    </section>
  );
}

function WireframeSection({
  section,
  index,
  selected,
  onSelect,
}: {
  section: WireframeSectionV1Output;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation("account");
  const bindings = section.bindings ?? [];
  const missingCount = bindings.filter((binding) => binding.kind === "missing").length;
  return (
    <li className="relative pl-8">
      <span
        className={cn(
          "absolute top-5 left-0 z-10 flex size-6 items-center justify-center rounded-full border bg-background font-mono text-caption tabular-nums",
          selected ? "border-primary text-primary" : "border-border text-label-secondary",
        )}
        aria-hidden="true"
      >
        {index + 1}
      </span>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          "w-full rounded-lg border p-5 text-left transition-[border-color,box-shadow,transform] duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none",
          selected
            ? "border-primary shadow-[0_0_0_1px_var(--primary)]"
            : "border-border hover:-translate-y-0.5 hover:border-label-secondary/45 hover:shadow-sm",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-caption text-label-secondary">{section.intentId}</p>
            <h3 className="mt-1 truncate text-body font-semibold text-label-primary">
              {section.label}
            </h3>
            <p className="mt-1 truncate text-footnote text-label-secondary">
              {section.componentKey} · {section.variantKey}
            </p>
          </div>
          <BaseTag color={missingCount > 0 ? "gold" : "default"}>
            {missingCount > 0
              ? t("CREATION_EDITOR_WIREFRAME_MISSING_COUNT", { count: missingCount })
              : t("CREATION_EDITOR_WIREFRAME_BINDINGS_READY")}
          </BaseTag>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {bindings.slice(0, 4).map((binding) => (
            <div
              key={binding.slotKey}
              className={cn(
                "min-h-11 rounded-md border px-3 py-2",
                binding.kind === "missing"
                  ? "border-dashed border-border bg-muted/45"
                  : "border-border",
              )}
            >
              <p className="truncate text-caption font-medium text-label-secondary">
                {binding.slotKey}
              </p>
              <p className="mt-0.5 truncate text-footnote text-label-primary">
                {binding.kind === "field"
                  ? binding.fieldKey
                  : binding.kind === "missing"
                    ? t(`CREATION_EDITOR_WIREFRAME_MISSING_${binding.reason.toUpperCase()}`)
                    : t("CREATION_EDITOR_WIREFRAME_LITERAL_VALUE")}
              </p>
            </div>
          ))}
        </div>
      </button>
    </li>
  );
}

function ViewportButton({
  viewport,
  current,
  icon: Icon,
  label,
  onChange,
}: {
  viewport: WireframeViewport;
  current: WireframeViewport;
  icon: LucideIcon;
  label: string;
  onChange: (viewport: WireframeViewport) => void;
}) {
  return (
    <Button
      variant={viewport === current ? "secondary" : "ghost"}
      size="icon-sm"
      aria-label={label}
      aria-pressed={viewport === current}
      onClick={() => onChange(viewport)}
    >
      <Icon className="size-4" />
    </Button>
  );
}

function WireframeEmpty({
  title,
  description,
  compact,
}: {
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto max-w-md text-center",
        !compact && "mt-[14vh] rounded-xl border border-border bg-background p-8 shadow-sm",
      )}
    >
      <span className="mx-auto flex size-11 items-center justify-center rounded-lg bg-muted text-label-secondary">
        <PanelsTopLeft className="size-5" />
      </span>
      <h2 className="mt-4 text-body font-semibold text-label-primary">{title}</h2>
      <p className="mt-2 text-footnote leading-5 text-label-secondary">{description}</p>
    </div>
  );
}

function CanvasGrid() {
  return (
    <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
      <defs>
        <pattern id="wireframe-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" className="fill-border/55" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#wireframe-grid)" />
    </svg>
  );
}
