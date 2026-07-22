import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  BuilderChangeSetPreviewOut,
  BuilderGlobalSectionReferenceOut,
  BuilderRevisionGlobalSectionOut,
  BuilderRevisionOut,
} from "@arclayer/openapi";

import { SharedSectionIssueList } from "@/pages/projects/editor/shared-section-manager-elements";

export function SharedSectionRetirementReview({
  revision,
  section,
  preview,
  previewing,
}: {
  revision: BuilderRevisionOut;
  section: BuilderRevisionGlobalSectionOut;
  preview: BuilderChangeSetPreviewOut | null;
  previewing: boolean;
}) {
  const { t } = useTranslation("account");
  const references = preview ? collectIncomingReferences(preview, section.itemId) : [];
  return (
    <div className="px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div>
          <h3 className="text-body font-semibold text-label-primary">{section.title}</h3>
          <p className="mt-1 font-mono text-caption text-label-secondary">{section.slug}</p>
        </div>
        <p className="text-caption text-label-secondary">
          {t("CREATION_EDITOR_SHARED_SECTIONS_IDENTITY", {
            locale: section.locale,
            version: section.versionNumber,
          })}
        </p>
      </div>
      {previewing ? (
        <p role="status" className="py-12 text-center text-footnote text-label-secondary">
          {t("CREATION_EDITOR_SHARED_SECTIONS_CHECKING_REFERENCES")}
        </p>
      ) : preview ? (
        <RetirementEvidence revision={revision} preview={preview} references={references} />
      ) : null}
    </div>
  );
}

function RetirementEvidence({
  revision,
  preview,
  references,
}: {
  revision: BuilderRevisionOut;
  preview: BuilderChangeSetPreviewOut;
  references: readonly BuilderGlobalSectionReferenceOut[];
}) {
  const { t } = useTranslation("account");
  return (
    <div className="py-5">
      <div className="flex items-center gap-2">
        <AlertTriangle
          className={references.length > 0 ? "size-4 text-negative" : "size-4 text-warning"}
          aria-hidden="true"
        />
        <h4 className="text-footnote font-semibold text-label-primary">
          {references.length > 0
            ? t("CREATION_EDITOR_SHARED_SECTIONS_REFERENCES_BLOCKING", {
                count: references.length,
              })
            : t("CREATION_EDITOR_SHARED_SECTIONS_REFERENCES_CLEAR")}
        </h4>
      </div>
      {references.length > 0 ? (
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {references.map((reference) => (
            <li
              key={`${reference.hostKind}:${reference.hostItemId}:${reference.hostSectionId}`}
              className="py-3"
            >
              <p className="text-footnote font-medium text-label-primary">
                {resolveHostTitle(revision, reference)}
              </p>
              <p className="mt-1 font-mono text-caption text-label-secondary">
                {reference.hostItemId} · {reference.hostSectionId}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-caption leading-5 text-label-secondary">
          {t("CREATION_EDITOR_SHARED_SECTIONS_RETIRE_APPROVAL_DESC")}
        </p>
      )}
      <SharedSectionIssueList preview={preview} />
    </div>
  );
}

function collectIncomingReferences(
  preview: BuilderChangeSetPreviewOut,
  targetItemId: string,
): readonly BuilderGlobalSectionReferenceOut[] {
  return (preview.globalSectionGraph?.references ?? []).filter(
    (reference) => reference.targetItemId === targetItemId,
  );
}

function resolveHostTitle(
  revision: BuilderRevisionOut,
  reference: BuilderGlobalSectionReferenceOut,
): string {
  if (reference.hostKind === "page") {
    return (
      revision.pages.find((page) => page.itemId === reference.hostItemId)?.title ??
      reference.hostItemId
    );
  }
  return (
    revision.globalSections?.find((section) => section.itemId === reference.hostItemId)?.title ??
    reference.hostItemId
  );
}
