import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { saveContentItemDraftVersion } from "@/api/content";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { projectContentLibraryFocusedItemHref } from "@/lib/routing/project-content-routing";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import {
  buildContentLibraryItemsQueryKey,
  buildContentStructuredSurfaceSnapshotQueryKey,
  type ContentStructuredSurfaceSnapshot,
  loadContentStructuredSurfaceSnapshot,
} from "@/pages/projects/content/library/runtime";
import {
  getContentTypeDescription,
  getContentTypeLabel,
} from "@/pages/projects/content/content-type-presentation";
import type { JsonValueInput } from "@arclayer/openapi";
import type { getContentItem, getContentItemVersion } from "@/api/content";
import { Button } from "@arclayer/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";
import { Textarea } from "@arclayer/ui/textarea";

const STRUCTURED_REQUIRED_CAPABILITIES = ["queryable"] as const;
type AdminContentItem = Awaited<ReturnType<typeof getContentItem>>;
type AdminContentVersion = Awaited<ReturnType<typeof getContentItemVersion>>;

function hasStructuredCapabilities(item: AdminContentItem) {
  return STRUCTURED_REQUIRED_CAPABILITIES.every((capability) =>
    item.capabilityPackIds.includes(capability),
  );
}

function getMissingStructuredCapabilities(item: AdminContentItem) {
  return STRUCTURED_REQUIRED_CAPABILITIES.filter(
    (capability) => !item.capabilityPackIds.includes(capability),
  );
}

function getStructuredCapabilityLabel() {
  return "CONTENT_MODELS_CAPABILITY_QUERYABLE_LABEL";
}

function ItemFact(props: { label: string; value: string }) {
  return (
    <div className="grid gap-1.5">
      <div className="text-footnote text-label-secondary">{props.label}</div>
      <div className="text-body text-label-primary">{props.value}</div>
    </div>
  );
}

function formatFieldValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function formatFieldsJson(version: AdminContentVersion | null): string {
  return JSON.stringify(version?.fieldsSnapshot ?? {}, null, 2);
}

function parseFieldsJson(value: string): Record<string, JsonValueInput> {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("CONTENT_STRUCTURED_SURFACE_FIELDS_INVALID_OBJECT");
  }
  return parsed as Record<string, JsonValueInput>;
}

function getFieldEntries(version: AdminContentVersion | null): Array<[string, unknown]> {
  const snapshot = version?.fieldsSnapshot ?? {};
  return Object.entries(snapshot).filter(([key]) => Boolean(key.trim()));
}

function StructuredFieldsSnapshotCard(props: {
  error: boolean;
  fieldError: string | null;
  fieldsDraft: string;
  loading: boolean;
  onFieldsDraftChange: (value: string) => void;
  onSaveFields: () => void;
  saving: boolean;
  version: AdminContentVersion | null;
}) {
  const { t } = useTranslation("content");
  const fields = getFieldEntries(props.version);
  const versionLabel = props.version?.versionNumber
    ? `v${props.version.versionNumber}`
    : t("CONTENT_STRUCTURED_SURFACE_FIELDS_VERSION_NONE");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("CONTENT_STRUCTURED_SURFACE_FIELDS_TITLE")}</CardTitle>
        <CardDescription>
          {t("CONTENT_STRUCTURED_SURFACE_FIELDS_DESC", { version: versionLabel })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {props.loading ? (
          <div
            className="rounded-2xl border border-border/60 bg-muted/30 px-4 py-4 text-sm text-muted-foreground"
            data-testid="content-structured-surface-fields-loading"
          >
            {t("CONTENT_STRUCTURED_SURFACE_FIELDS_LOADING")}
          </div>
        ) : null}
        {props.error ? (
          <div
            className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-4 text-sm text-destructive"
            data-testid="content-structured-surface-fields-error"
          >
            {t("CONTENT_STRUCTURED_SURFACE_FIELDS_ERROR")}
          </div>
        ) : null}
        {!props.loading && !props.error && fields.length === 0 ? (
          <div
            className="rounded-2xl border border-border/60 bg-muted/30 px-4 py-4 text-sm text-muted-foreground"
            data-testid="content-structured-surface-fields-empty"
          >
            {t("CONTENT_STRUCTURED_SURFACE_FIELDS_EMPTY")}
          </div>
        ) : null}
        {!props.loading && !props.error && fields.length > 0 ? (
          <dl className="grid gap-3" data-testid="content-structured-surface-fields">
            {fields.map(([key, value]) => (
              <div
                key={key}
                className="grid gap-2 rounded-2xl border border-border/60 bg-background px-4 py-3 md:grid-cols-[180px_minmax(0,1fr)]"
              >
                <dt className="break-all text-footnote font-medium text-label-secondary">{key}</dt>
                <dd className="min-w-0 whitespace-pre-wrap break-words font-mono text-footnote text-label-primary">
                  {formatFieldValue(value)}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {!props.loading && !props.error ? (
          <div className="mt-5 grid gap-3">
            <div className="grid gap-1.5">
              <label
                htmlFor="content-structured-fields-json"
                className="text-footnote font-medium text-label-secondary"
              >
                {t("CONTENT_STRUCTURED_SURFACE_FIELDS_JSON_LABEL")}
              </label>
              <Textarea
                id="content-structured-fields-json"
                value={props.fieldsDraft}
                onChange={(event) => props.onFieldsDraftChange(event.target.value)}
                className="min-h-56 font-mono text-footnote"
                aria-invalid={props.fieldError ? true : undefined}
              />
              {props.fieldError ? (
                <p
                  className="text-footnote text-destructive"
                  data-testid="content-structured-surface-fields-validation"
                >
                  {props.fieldError}
                </p>
              ) : (
                <p className="text-footnote text-label-secondary">
                  {t("CONTENT_STRUCTURED_SURFACE_FIELDS_JSON_HELP")}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={props.onSaveFields} disabled={props.saving}>
                {props.saving
                  ? t("CONTENT_STRUCTURED_SURFACE_FIELDS_SAVING")
                  : t("CONTENT_STRUCTURED_SURFACE_FIELDS_SAVE")}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ContentStructuredSurfacePage(props: { projectId: string; item: AdminContentItem }) {
  const { t } = useTranslation("content");
  const queryClient = useQueryClient();
  const itemLabel = props.item.title?.trim() || props.item.slug;
  const contentTypeLabel = getContentTypeLabel({
    modelKey: props.item.modelKey,
    fallbackName: props.item.modelKey,
    fallbackLabel: "--",
    t,
  });
  const contentTypeDescription =
    getContentTypeDescription({
      modelKey: props.item.modelKey,
      t,
    }) ?? t("CONTENT_TYPE_CATEGORY_DESC");
  const libraryHref = projectContentLibraryFocusedItemHref(props.projectId, props.item.id);
  const missingCapabilities = getMissingStructuredCapabilities(props.item);
  const snapshotQuery = useQuery({
    queryKey: buildContentStructuredSurfaceSnapshotQueryKey(props.projectId, props.item.id),
    queryFn: () => loadContentStructuredSurfaceSnapshot(props.projectId, props.item),
    retry: false,
    meta: { silent: true },
  });
  const displayVersion =
    snapshotQuery.data?.draftVersion ?? snapshotQuery.data?.publishedVersion ?? null;
  const [fieldsDraft, setFieldsDraft] = React.useState(() => formatFieldsJson(displayVersion));
  const [fieldError, setFieldError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setFieldsDraft(formatFieldsJson(displayVersion));
    setFieldError(null);
  }, [displayVersion]);

  const fieldsMutation = useMutation({
    mutationFn: async (fieldsSnapshot: Record<string, JsonValueInput>) =>
      saveContentItemDraftVersion(props.projectId, props.item.id, {
        expectedVersion: snapshotQuery.data?.draftVersion?.versionNumber ?? null,
        changeSummary: t("CONTENT_STRUCTURED_SURFACE_FIELDS_CHANGE_SUMMARY"),
        fieldsSnapshot,
        presentations: [
          {
            kind: "form_data",
            payload: fieldsSnapshot,
          },
        ],
      }),
    onSuccess: async (version) => {
      notifySuccessText(t("CONTENT_STRUCTURED_SURFACE_FIELDS_SAVE_SUCCESS"));
      setFieldsDraft(formatFieldsJson(version));
      queryClient.setQueryData<ContentStructuredSurfaceSnapshot>(
        buildContentStructuredSurfaceSnapshotQueryKey(props.projectId, props.item.id),
        (current) => ({
          draftVersion: version,
          publishedVersion:
            current?.publishedVersion ?? snapshotQuery.data?.publishedVersion ?? null,
        }),
      );
      await queryClient.invalidateQueries({
        queryKey: buildContentLibraryItemsQueryKey(props.projectId),
      });
    },
    onError: (error) => notifyError(error),
  });

  const handleSaveFields = React.useCallback(() => {
    try {
      const fieldsSnapshot = parseFieldsJson(fieldsDraft);
      setFieldError(null);
      fieldsMutation.mutate(fieldsSnapshot);
    } catch {
      setFieldError(t("CONTENT_STRUCTURED_SURFACE_FIELDS_INVALID_JSON"));
    }
  }, [fieldsDraft, fieldsMutation, t]);

  return (
    <DefaultPage
      title={t("CONTENT_STRUCTURED_SURFACE_TITLE")}
      showFavoriteToggle={false}
      contentContainerClassName="mx-auto w-full max-w-4xl"
    >
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{itemLabel}</CardTitle>
            <CardDescription>{t("CONTENT_STRUCTURED_SURFACE_ITEM_DESC")}</CardDescription>
          </CardHeader>
          <CardContent
            className="grid gap-4 md:grid-cols-2"
            data-testid="content-structured-surface"
          >
            <ItemFact
              label={t("CONTENT_STRUCTURED_SURFACE_FIELD_MODEL")}
              value={contentTypeLabel}
            />
            <ItemFact
              label={t("CONTENT_STRUCTURED_SURFACE_FIELD_SLUG")}
              value={`/${props.item.slug}`}
            />
            <ItemFact
              label={t("CONTENT_STRUCTURED_SURFACE_FIELD_STATUS")}
              value={t(`CONTENT_LIBRARY_STATUS_${props.item.derivedStatus.toUpperCase()}`)}
            />
            <ItemFact
              label={t("CONTENT_STRUCTURED_SURFACE_FIELD_VISIBILITY")}
              value={t(`CONTENT_LIBRARY_VISIBILITY_${props.item.visibility.toUpperCase()}`)}
            />
          </CardContent>
        </Card>

        <StructuredFieldsSnapshotCard
          version={displayVersion}
          loading={snapshotQuery.isLoading}
          error={snapshotQuery.isError}
          fieldsDraft={fieldsDraft}
          fieldError={fieldError}
          saving={fieldsMutation.isPending}
          onFieldsDraftChange={(value) => {
            setFieldsDraft(value);
            setFieldError(null);
          }}
          onSaveFields={handleSaveFields}
        />

        <Card>
          <CardHeader>
            <CardTitle>{t("CONTENT_STRUCTURED_SURFACE_NEXT_TITLE")}</CardTitle>
            <CardDescription>{t("CONTENT_STRUCTURED_SURFACE_NEXT_DESC")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="rounded-2xl border border-border/60 bg-muted/30 px-4 py-4">
              <div className="text-sm font-medium text-foreground">
                {t("CONTENT_STRUCTURED_SURFACE_GUIDANCE_TITLE")}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{contentTypeDescription}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild type="button">
                <a href={libraryHref}>{t("CONTENT_ITEM_CONTINUATION_ACTION_BACK_TO_LIBRARY")}</a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {!hasStructuredCapabilities(props.item) ? (
          <Card data-testid="content-structured-surface-boundary">
            <CardHeader>
              <CardTitle>{t("CONTENT_STRUCTURED_SURFACE_BOUNDARY_TITLE")}</CardTitle>
              <CardDescription>{t("CONTENT_STRUCTURED_SURFACE_BOUNDARY_DESC")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <ItemFact
                label={t("CONTENT_STRUCTURED_SURFACE_FIELD_WORKSPACE")}
                value={props.projectId}
              />
              <ItemFact
                label={t("CONTENT_STRUCTURED_SURFACE_BOUNDARY_MISSING_LABEL")}
                value={
                  missingCapabilities.length > 0
                    ? missingCapabilities.map(() => t(getStructuredCapabilityLabel())).join(" / ")
                    : t("CONTENT_STRUCTURED_SURFACE_BOUNDARY_READY")
                }
              />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{t("CONTENT_STRUCTURED_SURFACE_CONTEXT_TITLE")}</CardTitle>
            <CardDescription>{t("CONTENT_STRUCTURED_SURFACE_CONTEXT_DESC")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <ItemFact
              label={t("CONTENT_STRUCTURED_SURFACE_FIELD_WORKSPACE")}
              value={props.projectId}
            />
            <ItemFact
              label={t("CONTENT_STRUCTURED_SURFACE_FIELD_ENTRY_POINT")}
              value={t("CONTENT_LIBRARY_ACTION_EDIT_FIELDS")}
            />
          </CardContent>
        </Card>
      </div>
    </DefaultPage>
  );
}
