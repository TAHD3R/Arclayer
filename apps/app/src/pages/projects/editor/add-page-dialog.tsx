import { Button } from "@arclayer/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@arclayer/ui/dialog";
import { Input } from "@arclayer/ui/input";
import { NativeSelect, NativeSelectOption } from "@arclayer/ui/native-select";
import type {
  BuilderChangeSetPreviewOut,
  BuilderChangeSetPreviewRequest,
  BuilderRevisionOut,
} from "@arclayer/openapi";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  applyProjectBuilderChangeSet,
  previewProjectBuilderChangeSet,
} from "@/api/project-builder";
import { getErrorMessage } from "@/lib/notifications";

interface AddPageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  revision: BuilderRevisionOut;
  onApplied: () => Promise<void>;
  onDraftAutosave: (operations: BuilderChangeSetPreviewRequest["operations"]) => Promise<unknown>;
}

function commandKey(prefix: string): string {
  return `${prefix}:${globalThis.crypto.randomUUID()}`;
}

function slugFromPath(path: string): string | null {
  if (path === "/") return "home";
  const segment = path
    .split("/")
    .reverse()
    .find((candidate) => candidate.length > 0);
  return segment?.toLowerCase() ?? null;
}

export function AddPageDialog({
  open,
  onOpenChange,
  projectId,
  revision,
  onApplied,
  onDraftAutosave,
}: AddPageDialogProps) {
  const { t } = useTranslation("account");
  const [title, setTitle] = useState("");
  const [path, setPath] = useState("");
  const [parentItemId, setParentItemId] = useState("");
  const [preview, setPreview] = useState<BuilderChangeSetPreviewOut | null>(null);
  const normalizedTitle = title.trim();
  const normalizedPath = path.trim();
  const normalizedSlug = slugFromPath(normalizedPath);
  const pathValid =
    normalizedPath.startsWith("/") && !/\s/.test(normalizedPath) && normalizedSlug !== null;
  const formValid = Boolean(normalizedTitle && pathValid);

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!formValid || normalizedSlug === null) {
        throw new Error(t("CREATION_EDITOR_ADD_PAGE_INVALID"));
      }
      const siblings = revision.pages.filter((page) => (page.parentItemId ?? "") === parentItemId);
      const operations: BuilderChangeSetPreviewRequest["operations"] = [
        {
          type: "page.create",
          operationId: commandKey("page-create-operation"),
          clientPageId: commandKey("page-create-client"),
          modelKey: "page",
          title: normalizedTitle,
          slug: normalizedSlug,
          path: normalizedPath,
          locale: revision.contentStructureRevision.snapshot.locales[0],
          parentItemId: parentItemId || null,
          sortOrder: siblings.length,
          fieldsSnapshot: { title: normalizedTitle, path: normalizedPath },
        },
      ];
      await onDraftAutosave(operations);
      return previewProjectBuilderChangeSet(
        projectId,
        {
          baseRevisionId: revision.siteRevision.id,
          baseEtag: revision.siteRevision.manifestHash,
          provenanceSource: "human",
          operations,
        },
        commandKey("page-create-preview"),
      );
    },
    onSuccess: setPreview,
  });

  const applyMutation = useMutation({
    mutationFn: () => {
      if (!preview) throw new Error(t("CREATION_EDITOR_ADD_PAGE_PREVIEW_REQUIRED"));
      return applyProjectBuilderChangeSet(
        projectId,
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
        commandKey("page-create-apply"),
      );
    },
    onSuccess: async () => {
      await onApplied();
      onOpenChange(false);
      setTitle("");
      setPath("");
      setParentItemId("");
      setPreview(null);
    },
  });

  const invalidatePreview = () => {
    setPreview(null);
    previewMutation.reset();
    applyMutation.reset();
  };
  const blockers = preview?.issues.filter((issue) => issue.severity === "blocker") ?? [];
  const error = previewMutation.error ?? applyMutation.error;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && (previewMutation.isPending || applyMutation.isPending)) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent closeButtonLabel={t("CREATION_EDITOR_ADD_PAGE_CLOSE")}>
        <DialogHeader>
          <DialogTitle>{t("CREATION_EDITOR_ADD_PAGE_TITLE")}</DialogTitle>
          <DialogDescription>{t("CREATION_EDITOR_ADD_PAGE_DESC")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label
              htmlFor="builder-page-title"
              className="text-footnote font-medium text-label-primary"
            >
              {t("CREATION_EDITOR_ADD_PAGE_NAME")}
            </label>
            <Input
              id="builder-page-title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                invalidatePreview();
              }}
              placeholder={t("CREATION_EDITOR_ADD_PAGE_NAME_PLACEHOLDER")}
              maxLength={256}
              className="mt-2"
            />
          </div>
          <div>
            <label
              htmlFor="builder-page-path"
              className="text-footnote font-medium text-label-primary"
            >
              {t("CREATION_EDITOR_ADD_PAGE_PATH")}
            </label>
            <Input
              id="builder-page-path"
              value={path}
              onChange={(event) => {
                setPath(event.target.value);
                invalidatePreview();
              }}
              placeholder="/pricing"
              maxLength={512}
              aria-invalid={Boolean(normalizedPath && !pathValid)}
              className="mt-2 font-mono"
            />
            {normalizedPath && !pathValid ? (
              <p className="mt-1 text-caption text-destructive">
                {t("CREATION_EDITOR_ADD_PAGE_PATH_INVALID")}
              </p>
            ) : null}
          </div>
          <div>
            <label
              htmlFor="builder-page-parent"
              className="text-footnote font-medium text-label-primary"
            >
              {t("CREATION_EDITOR_ADD_PAGE_PARENT")}
            </label>
            <NativeSelect
              id="builder-page-parent"
              value={parentItemId}
              onChange={(event) => {
                setParentItemId(event.target.value);
                invalidatePreview();
              }}
              className="mt-2 w-full"
            >
              <NativeSelectOption value="">{t("CREATION_EDITOR_PAGE_ROOT")}</NativeSelectOption>
              {revision.pages.map((page) => (
                <NativeSelectOption key={page.itemId} value={page.itemId}>
                  {page.title}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          {preview ? (
            <div className="rounded-lg border border-border bg-muted/35 p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-primary" />
                <p className="text-footnote font-medium text-label-primary">
                  {t("CREATION_EDITOR_ADD_PAGE_PREVIEW_READY")}
                </p>
              </div>
              <p className="mt-2 text-caption text-label-secondary">
                {t("CREATION_EDITOR_ADD_PAGE_PREVIEW_SUMMARY", {
                  targets: preview.affectedTargets.length,
                  issues: preview.issues.length,
                })}
              </p>
            </div>
          ) : null}
          {error ? (
            <div
              role="alert"
              className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-footnote text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{getErrorMessage(error)}</span>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={previewMutation.isPending || applyMutation.isPending}
          >
            {t("CREATION_EDITOR_ADD_PAGE_CANCEL")}
          </Button>
          {preview ? (
            <Button
              onClick={() => applyMutation.mutate()}
              loading={applyMutation.isPending}
              disabled={blockers.length > 0}
            >
              {preview.approvalClass === "none"
                ? t("CREATION_EDITOR_ADD_PAGE_APPLY")
                : t("CREATION_EDITOR_ADD_PAGE_APPROVE_APPLY")}
            </Button>
          ) : (
            <Button
              onClick={() => previewMutation.mutate()}
              loading={previewMutation.isPending}
              disabled={!formValid}
            >
              {t("CREATION_EDITOR_ADD_PAGE_PREVIEW")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
