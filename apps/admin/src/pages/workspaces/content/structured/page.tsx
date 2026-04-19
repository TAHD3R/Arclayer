import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/layouts/page-shell/default-page";
import { workspaceContentLibraryFocusedItemHref } from "@/lib/routing/workspace-content-routing";
import {
  getContentTypeDescription,
  getContentTypeLabel,
} from "@/pages/workspaces/content/content-type-presentation";
import type { AdminContentItem } from "@/types/api";
import { Button } from "@arclayer/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";

const STRUCTURED_REQUIRED_CAPABILITIES = ["queryable", "has_relations"] as const;

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

function getStructuredCapabilityLabel(
  capability: (typeof STRUCTURED_REQUIRED_CAPABILITIES)[number],
) {
  if (capability === "queryable") return "CONTENT_MODELS_CAPABILITY_QUERYABLE_LABEL";
  return "CONTENT_MODELS_CAPABILITY_HAS_RELATIONS_LABEL";
}

function ItemFact(props: { label: string; value: string }) {
  return (
    <div className="grid gap-1.5">
      <div className="text-footnote text-label-secondary">{props.label}</div>
      <div className="text-body text-label-primary">{props.value}</div>
    </div>
  );
}

export function ContentStructuredSurfacePage(props: {
  workspaceId: string;
  item: AdminContentItem;
}) {
  const { t } = useTranslation("content");
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
  const libraryHref = workspaceContentLibraryFocusedItemHref(props.workspaceId, props.item.id);
  const missingCapabilities = getMissingStructuredCapabilities(props.item);

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
                value={props.workspaceId}
              />
              <ItemFact
                label={t("CONTENT_STRUCTURED_SURFACE_BOUNDARY_MISSING_LABEL")}
                value={
                  missingCapabilities.length > 0
                    ? missingCapabilities
                        .map((capability) => t(getStructuredCapabilityLabel(capability)))
                        .join(" / ")
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
              value={props.workspaceId}
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
