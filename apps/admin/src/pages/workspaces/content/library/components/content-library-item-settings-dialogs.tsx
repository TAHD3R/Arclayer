import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { patchContentItemVersion, saveContentItemDraftVersion } from "@/api/content";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { buildContentItemsQueryKey } from "@/pages/workspaces/content/library/utils";
import type {
  AdminContentItemVisibility,
  AdminContentPresentation,
  AdminContentVersion,
} from "@/types/api";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { Textarea } from "@arclayer/ui/textarea";
import { Button } from "@arclayer/ui/button";

import { loadContentLibraryArticleEditorSnapshot } from "../article-editor/hooks/api";
import type { ContentLibraryTableRow } from "../types";

export type ContentLibraryItemSettingsDialogKind =
  | "permalink"
  | "visibility"
  | "seo"
  | "page-settings"
  | "structured-fields";

export type ContentLibraryItemSettingsDialogState = {
  kind: ContentLibraryItemSettingsDialogKind;
  row: ContentLibraryTableRow;
} | null;

type ContentLibraryItemSettingsDraft = {
  title: string;
  summary: string;
  slug: string;
  visibility: AdminContentItemVisibility;
  seo: {
    metaTitle: string;
    metaDescription: string;
    canonicalUrl: string;
    robotsDirective: string;
  };
};

function findPresentation(
  version: AdminContentVersion | null,
  kind: "seo",
): AdminContentPresentation | null {
  if (!version) return null;
  return version.presentations.find((presentation) => presentation.kind === kind) ?? null;
}

function readStringField(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value : "";
}

function readVisibilityField(
  source: Record<string, unknown>,
  fallback: AdminContentItemVisibility,
): AdminContentItemVisibility {
  return source.visibility === "private" ? "private" : fallback;
}

function buildDraftFromSnapshot(params: {
  row: ContentLibraryTableRow;
  version: AdminContentVersion | null;
}): ContentLibraryItemSettingsDraft {
  const fieldsSnapshot = params.version?.fieldsSnapshot ?? {};
  const seoPresentation = findPresentation(params.version, "seo");
  const seoPayload =
    seoPresentation?.payload && typeof seoPresentation.payload === "object"
      ? seoPresentation.payload
      : {};

  return {
    title: readStringField(fieldsSnapshot, "title") || params.row.title || params.row.name,
    summary: readStringField(fieldsSnapshot, "summary") || params.row.summary || "",
    slug: readStringField(fieldsSnapshot, "slug") || params.row.slug,
    visibility: readVisibilityField(fieldsSnapshot, params.row.visibility),
    seo: {
      metaTitle: readStringField(seoPayload, "metaTitle"),
      metaDescription: readStringField(seoPayload, "metaDescription"),
      canonicalUrl: readStringField(seoPayload, "canonicalUrl"),
      robotsDirective: readStringField(seoPayload, "robotsDirective"),
    },
  };
}

function omitManagedFields(source: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(source).filter(
      ([key]) => !new Set(["title", "summary", "slug", "visibility"]).has(key),
    ),
  );
}

function omitManagedPresentations(source: AdminContentPresentation[]) {
  return source.filter((presentation) => presentation.kind !== "seo");
}

function buildSeoPresentation(
  seo: ContentLibraryItemSettingsDraft["seo"],
): AdminContentPresentation | null {
  const payload: Record<string, unknown> = {};
  if (seo.metaTitle.trim()) payload.metaTitle = seo.metaTitle.trim();
  if (seo.metaDescription.trim()) payload.metaDescription = seo.metaDescription.trim();
  if (seo.canonicalUrl.trim()) payload.canonicalUrl = seo.canonicalUrl.trim();
  if (seo.robotsDirective.trim()) payload.robotsDirective = seo.robotsDirective.trim();
  return Object.keys(payload).length > 0 ? { kind: "seo", payload } : null;
}

function resolveDialogTitleKey(kind: ContentLibraryItemSettingsDialogKind) {
  if (kind === "permalink") return "CONTENT_LIBRARY_DIALOG_PERMALINK_TITLE";
  if (kind === "visibility") return "CONTENT_LIBRARY_DIALOG_VISIBILITY_TITLE";
  if (kind === "seo") return "CONTENT_LIBRARY_DIALOG_SEO_TITLE";
  if (kind === "page-settings") return "CONTENT_LIBRARY_DIALOG_PAGE_SETTINGS_TITLE";
  return "CONTENT_LIBRARY_DIALOG_STRUCTURED_FIELDS_TITLE";
}

function resolveDialogDescriptionKey(kind: ContentLibraryItemSettingsDialogKind) {
  if (kind === "permalink") return "CONTENT_LIBRARY_DIALOG_PERMALINK_DESC";
  if (kind === "visibility") return "CONTENT_LIBRARY_DIALOG_VISIBILITY_DESC";
  if (kind === "seo") return "CONTENT_LIBRARY_DIALOG_SEO_DESC";
  if (kind === "page-settings") return "CONTENT_LIBRARY_DIALOG_PAGE_SETTINGS_DESC";
  return "CONTENT_LIBRARY_DIALOG_STRUCTURED_FIELDS_DESC";
}

function resolveSaveSuccessKey(kind: ContentLibraryItemSettingsDialogKind) {
  if (kind === "permalink") return "CONTENT_LIBRARY_DIALOG_PERMALINK_SUCCESS";
  if (kind === "visibility") return "CONTENT_LIBRARY_DIALOG_VISIBILITY_SUCCESS";
  if (kind === "seo") return "CONTENT_LIBRARY_DIALOG_SEO_SUCCESS";
  if (kind === "page-settings") return "CONTENT_LIBRARY_DIALOG_PAGE_SETTINGS_SUCCESS";
  return "CONTENT_LIBRARY_DIALOG_STRUCTURED_FIELDS_SUCCESS";
}

function ContentLibraryItemSettingsDialogFooter(props: {
  confirmDisabled: boolean;
  confirmPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  t: (key: string) => string;
}) {
  return (
    <>
      <Button variant="ghost" onClick={props.onCancel} disabled={props.confirmPending}>
        {props.t("common:CANCEL")}
      </Button>
      <Button
        loading={props.confirmPending}
        disabled={props.confirmDisabled}
        onClick={props.onConfirm}
      >
        {props.t("common:CONFIRM")}
      </Button>
    </>
  );
}

export function ContentLibraryItemSettingsDialogs(props: {
  state: ContentLibraryItemSettingsDialogState;
  onClose: () => void;
}) {
  const { t } = useTranslation(["content", "common"]);
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState<ContentLibraryItemSettingsDraft | null>(null);
  const row = props.state?.row ?? null;
  const open = Boolean(props.state);
  const snapshotQuery = useQuery({
    queryKey: ["content-library-item-settings", row?.workspaceId, row?.id, props.state?.kind],
    queryFn: async () => {
      if (!row) throw new Error("CONTENT_LIBRARY_DIALOG_ROW_REQUIRED");
      return loadContentLibraryArticleEditorSnapshot(row.workspaceId, row.id);
    },
    enabled: Boolean(row),
    retry: false,
  });

  React.useEffect(() => {
    if (!row || !snapshotQuery.data) return;
    setDraft(
      buildDraftFromSnapshot({
        row,
        version: snapshotQuery.data.draftVersion,
      }),
    );
  }, [row, snapshotQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!props.state || !row || !draft || !snapshotQuery.data) {
        throw new Error("CONTENT_LIBRARY_DIALOG_STATE_MISSING");
      }

      const otherFieldsSnapshot = omitManagedFields(
        snapshotQuery.data.draftVersion?.fieldsSnapshot ?? {},
      );
      const otherPresentations = omitManagedPresentations(
        snapshotQuery.data.draftVersion?.presentations ?? [],
      );
      const seoPresentation = buildSeoPresentation(draft.seo);
      const payload = {
        fieldsSnapshot: {
          ...otherFieldsSnapshot,
          title: draft.title.trim(),
          summary: draft.summary.trim(),
          slug: draft.slug.trim(),
          visibility: draft.visibility,
        },
        presentations: [...otherPresentations, ...(seoPresentation ? [seoPresentation] : [])],
      };

      if (snapshotQuery.data.draftVersion?.versionNumber) {
        return patchContentItemVersion(
          row.workspaceId,
          row.id,
          snapshotQuery.data.draftVersion.versionNumber,
          payload,
        );
      }

      return saveContentItemDraftVersion(row.workspaceId, row.id, {
        expectedVersion: null,
        changeSummary: "Update content workbench settings",
        ...payload,
      });
    },
    onSuccess: async () => {
      if (!row || !props.state) return;
      notifySuccessText(t(resolveSaveSuccessKey(props.state.kind)));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: buildContentItemsQueryKey(row.workspaceId) }),
        queryClient.invalidateQueries({
          queryKey: ["content-library-item-settings", row.workspaceId, row.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["content-item-resolver", row.workspaceId, row.id],
        }),
      ]);
      props.onClose();
    },
    onError: (error) => notifyError(error),
  });

  const title = props.state ? t(resolveDialogTitleKey(props.state.kind)) : "";
  const description = props.state ? t(resolveDialogDescriptionKey(props.state.kind)) : "";
  const canSave = Boolean(draft && row && draft.slug.trim() && draft.title.trim());

  return (
    <SettingDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !saveMutation.isPending) props.onClose();
      }}
      title={title}
      description={description}
      footer={
        <ContentLibraryItemSettingsDialogFooter
          confirmDisabled={!canSave}
          confirmPending={saveMutation.isPending}
          onCancel={props.onClose}
          onConfirm={() => saveMutation.mutate()}
          t={t}
        />
      }
    >
      {snapshotQuery.isLoading || !draft ? (
        <div className="grid gap-4 py-2">
          <div className="text-body text-label-secondary">{t("common:LOADING")}</div>
        </div>
      ) : (
        <SettingDialogFields className="py-2">
          {props.state?.kind === "permalink" ? (
            <SettingDialogField
              title={t("CONTENT_LIBRARY_PREVIEW_FIELD_PERMALINK")}
              description={t("CONTENT_LIBRARY_DIALOG_PERMALINK_HELP")}
            >
              <Input
                value={draft.slug}
                onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
              />
            </SettingDialogField>
          ) : null}

          {props.state?.kind === "visibility" ? (
            <SettingDialogField
              title={t("CONTENT_LIBRARY_PREVIEW_FIELD_VISIBILITY")}
              description={t("CONTENT_LIBRARY_DIALOG_VISIBILITY_HELP")}
            >
              <Select
                value={draft.visibility}
                onValueChange={(value) =>
                  setDraft({
                    ...draft,
                    visibility: value === "private" ? "private" : "public",
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  <SelectItem value="public">{t("CONTENT_LIBRARY_VISIBILITY_PUBLIC")}</SelectItem>
                  <SelectItem value="private">{t("CONTENT_LIBRARY_VISIBILITY_PRIVATE")}</SelectItem>
                </SelectContent>
              </Select>
            </SettingDialogField>
          ) : null}

          {props.state?.kind === "seo" ? (
            <>
              <SettingDialogField
                title={t("CONTENT_LIBRARY_DIALOG_SEO_FIELD_TITLE")}
                description={t("CONTENT_LIBRARY_DIALOG_SEO_FIELD_TITLE_HELP")}
              >
                <Input
                  value={draft.seo.metaTitle}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      seo: { ...draft.seo, metaTitle: event.target.value },
                    })
                  }
                />
              </SettingDialogField>
              <SettingDialogField
                title={t("CONTENT_LIBRARY_DIALOG_SEO_FIELD_DESCRIPTION")}
                description={t("CONTENT_LIBRARY_DIALOG_SEO_FIELD_DESCRIPTION_HELP")}
              >
                <Textarea
                  value={draft.seo.metaDescription}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      seo: { ...draft.seo, metaDescription: event.target.value },
                    })
                  }
                />
              </SettingDialogField>
              <SettingDialogField
                title={t("CONTENT_LIBRARY_DIALOG_SEO_FIELD_CANONICAL")}
                description={t("CONTENT_LIBRARY_DIALOG_SEO_FIELD_CANONICAL_HELP")}
              >
                <Input
                  value={draft.seo.canonicalUrl}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      seo: { ...draft.seo, canonicalUrl: event.target.value },
                    })
                  }
                />
              </SettingDialogField>
            </>
          ) : null}

          {props.state?.kind === "page-settings" || props.state?.kind === "structured-fields" ? (
            <>
              <SettingDialogField
                title={t("CONTENT_LIBRARY_DIALOG_FIELD_TITLE")}
                description={t("CONTENT_LIBRARY_DIALOG_FIELD_TITLE_HELP")}
              >
                <Input
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                />
              </SettingDialogField>
              <SettingDialogField
                title={t("CONTENT_LIBRARY_DIALOG_FIELD_SUMMARY")}
                description={t("CONTENT_LIBRARY_DIALOG_FIELD_SUMMARY_HELP")}
              >
                <Textarea
                  value={draft.summary}
                  onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
                />
              </SettingDialogField>
              <SettingDialogField
                title={t("CONTENT_LIBRARY_PREVIEW_FIELD_VISIBILITY")}
                description={t("CONTENT_LIBRARY_DIALOG_FIELD_VISIBILITY_HELP")}
              >
                <Select
                  value={draft.visibility}
                  onValueChange={(value) =>
                    setDraft({
                      ...draft,
                      visibility: value === "private" ? "private" : "public",
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start">
                    <SelectItem value="public">{t("CONTENT_LIBRARY_VISIBILITY_PUBLIC")}</SelectItem>
                    <SelectItem value="private">
                      {t("CONTENT_LIBRARY_VISIBILITY_PRIVATE")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </SettingDialogField>
            </>
          ) : null}
        </SettingDialogFields>
      )}
    </SettingDialog>
  );
}
