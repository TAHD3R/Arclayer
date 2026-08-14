import type {
  BuilderChangeSetPreviewOut,
  BuilderChangeSetPreviewRequest,
  BuilderRevisionOut,
} from "@arclayer/openapi";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
  applyProjectBuilderChangeSet,
  previewProjectBuilderChangeSet,
} from "@/api/project-builder";
import { getErrorMessage, notifyError } from "@/lib/notifications";

function commandKey(prefix: string): string {
  return `${prefix}:${globalThis.crypto.randomUUID()}`;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "page"
  );
}

export interface SitemapInstantPagePlacement {
  parentItemId: string | null;
  sortOrder: number;
}

/**
 * Relume-style instant page creation: preview + auto-apply in one user gesture so the new
 * page appears on the canvas immediately while staying a reviewable server change set.
 */
export function useSitemapInstantPageCreate(input: {
  projectId: string;
  revision: BuilderRevisionOut | null;
  onDraftAutosave: (operations: BuilderChangeSetPreviewRequest["operations"]) => Promise<unknown>;
  onDraftDiscard: () => Promise<void>;
  invalidateBuilder: () => Promise<unknown>;
  onCreated: (page: { title: string; path: string }) => void;
}) {
  const { t } = useTranslation("account");

  return useMutation({
    mutationFn: async (placement: SitemapInstantPagePlacement) => {
      const revision = input.revision;
      if (!revision) throw new Error(t("CREATION_EDITOR_SITEMAP_REVISION_REQUIRED"));
      const existingTitles = new Set(revision.pages.map((page) => page.title));
      let index = revision.pages.length + 1;
      let title = t("CREATION_EDITOR_SITEMAP_NEW_PAGE_TITLE", { index });
      while (existingTitles.has(title)) {
        index += 1;
        title = t("CREATION_EDITOR_SITEMAP_NEW_PAGE_TITLE", { index });
      }
      const baseSlug = slugify(title);
      const existingPaths = new Set(
        revision.pages.flatMap((page) => (page.routes ?? []).map((route) => route.path)),
      );
      let path = `/${baseSlug}`;
      let suffix = 2;
      while (existingPaths.has(path)) {
        path = `/${baseSlug}-${suffix}`;
        suffix += 1;
      }
      const operations: BuilderChangeSetPreviewRequest["operations"] = [
        {
          type: "page.create",
          operationId: commandKey("sitemap-page-create-operation"),
          clientPageId: commandKey("sitemap-page-create-client"),
          modelKey: "page",
          title,
          slug: baseSlug,
          path,
          locale: revision.contentStructureRevision.snapshot.locales[0],
          parentItemId: placement.parentItemId,
          sortOrder: placement.sortOrder,
          fieldsSnapshot: { title, path },
        },
      ];
      await input.onDraftAutosave(operations);
      const preview: BuilderChangeSetPreviewOut = await previewProjectBuilderChangeSet(
        input.projectId,
        {
          baseRevisionId: revision.siteRevision.id,
          baseEtag: revision.siteRevision.manifestHash,
          provenanceSource: "human",
          operations,
        },
        commandKey("sitemap-page-create-preview"),
      );
      const blockers = preview.issues.filter((issue) => issue.severity === "blocker");
      if (blockers.length > 0) {
        throw new Error(t("CREATION_EDITOR_SITEMAP_INSTANT_CREATE_BLOCKED"));
      }
      await applyProjectBuilderChangeSet(
        input.projectId,
        preview.changeSetId,
        {
          previewToken: preview.previewToken,
          approval: preview.approval
            ? {
                approvalId: preview.approval.approvalId,
                decision: "approve",
                expectedApprovalClass: preview.approval.approvalClass,
              }
            : undefined,
        },
        commandKey("sitemap-page-create-apply"),
      );
      return { title, path };
    },
    onSuccess: async (created) => {
      await input.onDraftDiscard().catch(() => undefined);
      await input.invalidateBuilder();
      input.onCreated(created);
    },
    onError: (error) => notifyError(getErrorMessage(error)),
  });
}
