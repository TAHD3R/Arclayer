import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/layouts/page-shell/default-page";
import type { AdminContentItem } from "@/types/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";

import { SurfaceBoundaryCard } from "../surfaces/surface-boundary-card";

const STRUCTURED_REQUIRED_CAPABILITIES = ["queryable", "has_relations"] as const;

function hasStructuredCapabilities(item: AdminContentItem) {
  return STRUCTURED_REQUIRED_CAPABILITIES.some((capability) =>
    item.capabilityPackIds.includes(capability),
  );
}

function ItemFact(props: { label: string; value: string }) {
  return (
    <div className="space-y-1">
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

  return (
    <DefaultPage
      title={t("CONTENT_STRUCTURED_SURFACE_TITLE")}
      description={t("CONTENT_STRUCTURED_SURFACE_DESC")}
      showFavoriteToggle={false}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_320px]">
        <div className="space-y-6">
          <Card data-testid="content-structured-surface">
            <CardHeader>
              <CardTitle>{itemLabel}</CardTitle>
              <CardDescription>{t("CONTENT_STRUCTURED_SURFACE_ITEM_DESC")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <ItemFact
                  label={t("CONTENT_STRUCTURED_SURFACE_FIELD_SLUG")}
                  value={props.item.slug}
                />
                <ItemFact
                  label={t("CONTENT_STRUCTURED_SURFACE_FIELD_MODEL")}
                  value={props.item.modelKey ?? "--"}
                />
                <ItemFact
                  label={t("CONTENT_STRUCTURED_SURFACE_FIELD_ROLE")}
                  value={props.item.resolvedRole ?? props.item.role}
                />
                <ItemFact
                  label={t("CONTENT_STRUCTURED_SURFACE_FIELD_POSTURE")}
                  value={props.item.resolvedPosture ?? "--"}
                />
              </div>
              <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                <div className="text-sm font-medium text-foreground">
                  {t("CONTENT_STRUCTURED_SURFACE_SCHEMA_TITLE")}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("CONTENT_STRUCTURED_SURFACE_SCHEMA_DESC")}
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
                <div className="text-sm font-medium text-foreground">
                  {t("CONTENT_STRUCTURED_SURFACE_WORKFLOW_TITLE")}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("CONTENT_STRUCTURED_SURFACE_WORKFLOW_DESC")}
                </p>
              </div>
            </CardContent>
          </Card>

          {!hasStructuredCapabilities(props.item) ? (
            <SurfaceBoundaryCard
              item={props.item}
              titleKey="CONTENT_STRUCTURED_SURFACE_BOUNDARY_TITLE"
              descriptionKey="CONTENT_STRUCTURED_SURFACE_BOUNDARY_DESC"
              requiredCapabilities={[...STRUCTURED_REQUIRED_CAPABILITIES]}
              testId="content-structured-surface-boundary"
            />
          ) : null}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("CONTENT_STRUCTURED_SURFACE_SIDEBAR_TITLE")}</CardTitle>
            <CardDescription>{t("CONTENT_STRUCTURED_SURFACE_SIDEBAR_DESC")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ItemFact
              label={t("CONTENT_STRUCTURED_SURFACE_FIELD_WORKSPACE")}
              value={props.workspaceId}
            />
            <ItemFact
              label={t("CONTENT_ITEM_CONTINUATION_FIELD_SURFACE")}
              value={props.item.resolvedSurface ?? "structured"}
            />
            <ItemFact
              label={t("CONTENT_ITEM_CONTINUATION_FIELD_SHAPE_STATE")}
              value={props.item.shapeState ?? "ready"}
            />
          </CardContent>
        </Card>
      </div>
    </DefaultPage>
  );
}
