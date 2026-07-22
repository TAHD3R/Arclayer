import { Button } from "@arclayer/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@arclayer/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";
import type {
  BuilderGlobalSectionDependencyGraphOut,
  BuilderRevisionGlobalSectionOut,
  BuilderRevisionPageOut,
  WireframeSectionV1Output,
} from "@arclayer/openapi";
import { Check, ChevronsUpDown, CircleDashed, Link2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { BaseTag, lucideTagIcon } from "@/components/ui/tags";
import type { WireframeChangeOperation } from "@/pages/projects/editor/use-project-editor-controller";

interface WireframeGlobalReferenceControlProps {
  page: BuilderRevisionPageOut;
  section: WireframeSectionV1Output;
  globalSections: BuilderRevisionGlobalSectionOut[];
  graph: BuilderGlobalSectionDependencyGraphOut | null;
  disabled: boolean;
  onPreview: (operations: WireframeChangeOperation[]) => void;
}

export function WireframeGlobalReferenceControl({
  page,
  section,
  globalSections,
  graph,
  disabled,
  onPreview,
}: WireframeGlobalReferenceControlProps) {
  const { t } = useTranslation("account");
  const [open, setOpen] = useState(false);
  const currentReferenceId = section.globalReferenceId ?? null;
  const currentReference =
    globalSections.find((candidate) => candidate.itemId === currentReferenceId) ?? null;
  const incomingReferenceCount = currentReferenceId
    ? (graph?.references ?? []).filter((reference) => reference.targetItemId === currentReferenceId)
        .length
    : 0;
  const health = resolveReferenceHealth(page.itemId, section.id, currentReferenceId, graph);
  const selectionDisabled = disabled || globalSections.length === 0;

  const previewSetReference = (globalSectionItemId: string) => {
    setOpen(false);
    onPreview([
      {
        type: "wireframe.set_global_reference",
        operationId: globalThis.crypto.randomUUID(),
        itemId: page.itemId,
        expectedDraftVersion: page.versionNumber,
        sectionId: section.id,
        globalSectionItemId,
      },
    ]);
  };

  return (
    <section
      className="mt-5 border-t border-border pt-5"
      aria-labelledby="wireframe-shared-section-heading"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4
            id="wireframe-shared-section-heading"
            className="text-footnote font-semibold text-label-primary"
          >
            {t("CREATION_EDITOR_WIREFRAME_SHARED_SECTION_TITLE")}
          </h4>
          <p className="mt-1 text-caption leading-5 text-label-secondary">
            {t("CREATION_EDITOR_WIREFRAME_SHARED_SECTION_DESC")}
          </p>
        </div>
        <BaseTag icon={lucideTagIcon(currentReferenceId ? Link2 : CircleDashed)}>
          {t(
            currentReferenceId
              ? "CREATION_EDITOR_WIREFRAME_SHARED_SECTION_AUTHORITY_SHARED"
              : "CREATION_EDITOR_WIREFRAME_SHARED_SECTION_AUTHORITY_LOCAL",
          )}
        </BaseTag>
      </div>

      <ReferenceEvidence
        referenceId={currentReferenceId}
        reference={currentReference}
        incomingReferenceCount={incomingReferenceCount}
        health={health}
      />

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            role="combobox"
            aria-expanded={open}
            aria-label={t("CREATION_EDITOR_WIREFRAME_SHARED_SECTION_SELECT")}
            className="mt-3 min-h-11 w-full justify-between"
            disabled={selectionDisabled}
          >
            <span className="truncate">
              {currentReference?.title ??
                t("CREATION_EDITOR_WIREFRAME_SHARED_SECTION_SELECT_PLACEHOLDER")}
            </span>
            <ChevronsUpDown data-icon="inline-end" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" side="left" className="w-[min(22rem,calc(100vw-2rem))] p-0">
          <Command>
            <CommandInput placeholder={t("CREATION_EDITOR_WIREFRAME_SHARED_SECTION_SEARCH")} />
            <CommandList>
              <CommandEmpty>
                {t("CREATION_EDITOR_WIREFRAME_SHARED_SECTION_SEARCH_EMPTY")}
              </CommandEmpty>
              <CommandGroup heading={t("CREATION_EDITOR_WIREFRAME_SHARED_SECTION_GROUP")}>
                {globalSections.map((globalSection) => {
                  const hasWireframe = Boolean(globalSection.wireframe);
                  const selected = globalSection.itemId === currentReferenceId;
                  return (
                    <CommandItem
                      key={globalSection.itemId}
                      value={[
                        globalSection.title,
                        globalSection.slug,
                        globalSection.locale,
                        globalSection.purpose ?? "",
                      ].join(" ")}
                      disabled={disabled || !hasWireframe || selected}
                      onSelect={() => previewSetReference(globalSection.itemId)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{globalSection.title}</span>
                          {selected ? <Check aria-hidden="true" /> : null}
                        </div>
                        <p className="mt-0.5 truncate font-mono text-caption text-label-secondary">
                          {formatReferenceMetadata(globalSection)}
                        </p>
                        {!hasWireframe ? (
                          <p className="mt-1 text-caption text-label-secondary">
                            {t("CREATION_EDITOR_WIREFRAME_SHARED_SECTION_WIREFRAME_REQUIRED")}
                          </p>
                        ) : null}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {globalSections.length === 0 ? (
        <p className="mt-2 text-caption leading-5 text-label-secondary">
          {t("CREATION_EDITOR_WIREFRAME_SHARED_SECTION_EMPTY")}
        </p>
      ) : null}

      {currentReferenceId ? (
        <Button
          type="button"
          variant="ghost"
          className="mt-2 min-h-11 w-full"
          disabled={disabled}
          onClick={() =>
            onPreview([
              {
                type: "wireframe.clear_global_reference",
                operationId: globalThis.crypto.randomUUID(),
                itemId: page.itemId,
                expectedDraftVersion: page.versionNumber,
                sectionId: section.id,
              },
            ])
          }
        >
          {t("CREATION_EDITOR_WIREFRAME_SHARED_SECTION_CLEAR")}
        </Button>
      ) : null}
      <p className="mt-2 text-caption leading-5 text-label-secondary">
        {t("CREATION_EDITOR_WIREFRAME_SHARED_SECTION_PREVIEW_HINT")}
      </p>
    </section>
  );
}

function ReferenceEvidence({
  referenceId,
  reference,
  incomingReferenceCount,
  health,
}: {
  referenceId: string | null;
  reference: BuilderRevisionGlobalSectionOut | null;
  incomingReferenceCount: number;
  health: ReferenceHealth;
}) {
  const { t } = useTranslation("account");
  if (!referenceId) {
    return (
      <p className="mt-3 rounded-md border border-border bg-muted/35 px-3 py-2.5 text-caption text-label-secondary">
        {t("CREATION_EDITOR_WIREFRAME_SHARED_SECTION_LOCAL_EVIDENCE")}
      </p>
    );
  }
  return (
    <div className="mt-3 rounded-md border border-border bg-muted/35 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-footnote font-medium text-label-primary">
            {reference?.title ?? t("CREATION_EDITOR_WIREFRAME_SHARED_SECTION_UNKNOWN")}
          </p>
          <p className="mt-1 truncate font-mono text-caption text-label-secondary">
            {reference ? formatReferenceMetadata(reference) : referenceId}
          </p>
        </div>
        <BaseTag>{t("CREATION_EDITOR_WIREFRAME_SHARED_SECTION_EXACT_VERSION")}</BaseTag>
      </div>
      <p className="mt-2 text-caption text-label-secondary">
        {t("CREATION_EDITOR_WIREFRAME_SHARED_SECTION_INCOMING", {
          count: incomingReferenceCount,
        })}
      </p>
      {health !== "healthy" ? (
        <p className="mt-2 flex items-start gap-2 text-caption leading-5 text-label-secondary">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          {t(`CREATION_EDITOR_WIREFRAME_SHARED_SECTION_HEALTH_${health.toUpperCase()}`)}
        </p>
      ) : null}
    </div>
  );
}

type ReferenceHealth = "healthy" | "unknown" | "missing_wireframe" | "cycle";

function resolveReferenceHealth(
  hostItemId: string,
  hostSectionId: string,
  targetItemId: string | null,
  graph: BuilderGlobalSectionDependencyGraphOut | null,
): ReferenceHealth {
  if (!targetItemId || !graph) return "healthy";
  const matchesHost = (reference: { hostItemId: string; hostSectionId: string }) =>
    reference.hostItemId === hostItemId && reference.hostSectionId === hostSectionId;
  if ((graph.unknownReferences ?? []).some(matchesHost)) return "unknown";
  if ((graph.missingWireframeReferences ?? []).some(matchesHost)) return "missing_wireframe";
  if ((graph.cycles ?? []).some((cycle) => cycle.itemPath.includes(targetItemId))) return "cycle";
  return "healthy";
}

function formatReferenceMetadata(reference: BuilderRevisionGlobalSectionOut): string {
  return `${reference.locale} · /${reference.slug} · v${reference.versionNumber}`;
}
