import { Braces, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { BuilderRevisionGlobalSectionOut, BuilderRevisionOut } from "@arclayer/openapi";
import { Button } from "@arclayer/ui/button";

export function SharedSectionCatalog({
  revision,
  canWrite,
  onCreate,
  onRetire,
}: {
  revision: BuilderRevisionOut;
  canWrite: boolean;
  onCreate: () => void;
  onRetire: (section: BuilderRevisionGlobalSectionOut) => void;
}) {
  const { t } = useTranslation("account");
  const sections = revision.globalSections ?? [];
  const incomingCounts = countIncomingReferences(revision);
  return (
    <div className="px-6 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-footnote text-label-secondary">
          {t("CREATION_EDITOR_SHARED_SECTIONS_COUNT", { count: sections.length })}
        </p>
        <Button type="button" className="min-h-11" onClick={onCreate} disabled={!canWrite}>
          <Plus className="size-4" aria-hidden="true" />
          {t("CREATION_EDITOR_SHARED_SECTIONS_ADD")}
        </Button>
      </div>
      {sections.length > 0 ? (
        <ul className="mt-5 divide-y divide-border border-y border-border">
          {sections.map((section) => (
            <SharedSectionRow
              key={section.itemId}
              section={section}
              incomingCount={incomingCounts.get(section.itemId) ?? 0}
              canWrite={canWrite}
              onRetire={onRetire}
            />
          ))}
        </ul>
      ) : (
        <div className="py-16 text-center">
          <Braces className="mx-auto size-7 text-label-tertiary" aria-hidden="true" />
          <h3 className="mt-4 text-body font-semibold text-label-primary">
            {t("CREATION_EDITOR_SHARED_SECTIONS_EMPTY_TITLE")}
          </h3>
          <p className="mx-auto mt-2 max-w-md text-footnote text-label-secondary">
            {t("CREATION_EDITOR_SHARED_SECTIONS_EMPTY_DESC")}
          </p>
        </div>
      )}
    </div>
  );
}

function SharedSectionRow({
  section,
  incomingCount,
  canWrite,
  onRetire,
}: {
  section: BuilderRevisionGlobalSectionOut;
  incomingCount: number;
  canWrite: boolean;
  onRetire: (section: BuilderRevisionGlobalSectionOut) => void;
}) {
  const { t } = useTranslation("account");
  const planned = Boolean(section.purpose?.trim() && section.sectionIntents?.length);
  return (
    <li className="grid gap-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="truncate text-body font-semibold text-label-primary">{section.title}</h3>
          <code className="truncate text-caption text-label-secondary">{section.slug}</code>
        </div>
        <p className="mt-1 text-caption text-label-secondary">
          {t("CREATION_EDITOR_SHARED_SECTIONS_IDENTITY", {
            locale: section.locale,
            version: section.versionNumber,
          })}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption text-label-secondary">
          <StatusItem
            ready={planned}
            readyLabel={t("CREATION_EDITOR_SHARED_SECTIONS_PLAN_READY")}
            missingLabel={t("CREATION_EDITOR_SHARED_SECTIONS_PLAN_MISSING")}
          />
          <StatusItem
            ready={Boolean(section.wireframe)}
            readyLabel={t("CREATION_EDITOR_SHARED_SECTIONS_WIREFRAME_READY")}
            missingLabel={t("CREATION_EDITOR_SHARED_SECTIONS_WIREFRAME_MISSING")}
          />
          <span>{t("CREATION_EDITOR_SHARED_SECTIONS_INCOMING", { count: incomingCount })}</span>
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        className="min-h-11 justify-self-start text-negative hover:text-negative sm:justify-self-end"
        aria-label={`${t("CREATION_EDITOR_SHARED_SECTIONS_RETIRE")} ${section.title}`}
        disabled={!canWrite}
        onClick={() => onRetire(section)}
      >
        <Trash2 className="size-4" aria-hidden="true" />
        {t("CREATION_EDITOR_SHARED_SECTIONS_RETIRE")}
      </Button>
    </li>
  );
}

function StatusItem({
  ready,
  readyLabel,
  missingLabel,
}: {
  ready: boolean;
  readyLabel: string;
  missingLabel: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={ready ? "size-1.5 rounded-full bg-positive" : "size-1.5 rounded-full bg-warning"}
        aria-hidden="true"
      />
      {ready ? readyLabel : missingLabel}
    </span>
  );
}

function countIncomingReferences(revision: BuilderRevisionOut): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const reference of revision.globalSectionGraph?.references ?? []) {
    counts.set(reference.targetItemId, (counts.get(reference.targetItemId) ?? 0) + 1);
  }
  return counts;
}
