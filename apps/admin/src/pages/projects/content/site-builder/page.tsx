import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/layouts/page-shell/default-page";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import { projectContentLibraryPath } from "@/lib/routing/project-content-routing";
import type { AdminContentItem } from "@/types/api";
import { Button } from "@arclayer/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";

import { SurfaceBoundaryCard } from "../surfaces/surface-boundary-card";

const CANVAS_REQUIRED_CAPABILITIES = ["visual_editable"] as const;

function hasCanvasCapabilities(item: AdminContentItem) {
  return CANVAS_REQUIRED_CAPABILITIES.every((capability) =>
    item.capabilityPackIds.includes(capability),
  );
}

function ShellMetric(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
      <div className="text-footnote text-label-secondary">{props.label}</div>
      <div className="mt-2 text-base font-medium text-label-primary">{props.value}</div>
    </div>
  );
}

export function ContentSiteBuilderPage(props: {
  projectId: string;
  item?: AdminContentItem | null;
}) {
  const { t } = useTranslation("content");
  const permissionAccess = useProjectPermissionAccess(props.projectId);
  const permissionReady =
    permissionAccess.authzQuery.isFetched && permissionAccess.actionsQuery.isFetched;
  const canConfigureBuilder =
    permissionReady && permissionAccess.hasAction("project:content:site-builder:write");
  const itemLabel =
    props.item?.title?.trim() || props.item?.slug || t("CONTENT_SITE_BUILDER_EMPTY_TITLE");

  return (
    <DefaultPage
      title={t("CONTENT_SITE_BUILDER_TITLE")}
      description={t("CONTENT_SITE_BUILDER_DESC")}
      showFavoriteToggle={false}
    >
      <div className="space-y-6" data-testid="content-site-builder-shell">
        <div className="grid gap-4 md:grid-cols-3">
          <ShellMetric label={t("CONTENT_SITE_BUILDER_METRIC_WORKSPACE")} value={props.projectId} />
          <ShellMetric
            label={t("CONTENT_SITE_BUILDER_METRIC_SURFACE")}
            value={props.item?.resolvedSurface ?? "canvas"}
          />
          <ShellMetric
            label={t("CONTENT_SITE_BUILDER_METRIC_ITEM")}
            value={props.item ? itemLabel : t("CONTENT_SITE_BUILDER_EMPTY_METRIC")}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
          <Card>
            <CardHeader>
              <CardTitle>{t("CONTENT_SITE_BUILDER_NAV_TITLE")}</CardTitle>
              <CardDescription>{t("CONTENT_SITE_BUILDER_NAV_DESC")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-3 text-sm text-label-primary">
                {t("CONTENT_SITE_BUILDER_NAV_PAGES")}
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
                {t("CONTENT_SITE_BUILDER_NAV_GLOBALS")}
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
                {t("CONTENT_SITE_BUILDER_NAV_SECTIONS")}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{itemLabel}</CardTitle>
              <CardDescription>{t("CONTENT_SITE_BUILDER_CANVAS_DESC")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {permissionReady && !canConfigureBuilder ? (
                <div
                  className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground"
                  data-testid="content-site-builder-no-access"
                >
                  {t("CONTENT_SITE_BUILDER_NO_ACCESS_DESC")}
                </div>
              ) : null}
              {props.item ? (
                <div
                  className="min-h-[360px] rounded-[28px] border border-dashed border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-6"
                  data-testid="content-site-builder-canvas"
                >
                  <div className="text-sm font-medium text-label-primary">
                    {t("CONTENT_SITE_BUILDER_CANVAS_TITLE")}
                  </div>
                  <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                    {t("CONTENT_SITE_BUILDER_CANVAS_BODY")}
                  </p>
                </div>
              ) : (
                <div
                  className="flex min-h-[280px] flex-col items-start justify-center rounded-[28px] border border-dashed border-border/70 bg-muted/20 p-6"
                  data-testid="content-site-builder-empty-state"
                >
                  <div className="text-lg font-medium text-label-primary">
                    {t("CONTENT_SITE_BUILDER_EMPTY_TITLE")}
                  </div>
                  <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                    {t("CONTENT_SITE_BUILDER_EMPTY_DESC")}
                  </p>
                  <Button asChild className="mt-4" type="button">
                    <a href={projectContentLibraryPath(props.projectId)}>
                      {t("CONTENT_ITEM_CONTINUATION_ACTION_BACK_TO_LIBRARY")}
                    </a>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("CONTENT_SITE_BUILDER_INSPECTOR_TITLE")}</CardTitle>
              <CardDescription>{t("CONTENT_SITE_BUILDER_INSPECTOR_DESC")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div>{t("CONTENT_SITE_BUILDER_INSPECTOR_SECTIONS")}</div>
              <div>{t("CONTENT_SITE_BUILDER_INSPECTOR_LAYOUT")}</div>
              <div>{t("CONTENT_SITE_BUILDER_INSPECTOR_BINDINGS")}</div>
              <Button
                type="button"
                variant="outline"
                disabled={!canConfigureBuilder}
                data-testid="content-site-builder-open-item"
              >
                {t("CONTENT_SITE_BUILDER_ACTION_OPEN_ITEM")}
              </Button>
            </CardContent>
          </Card>
        </div>

        {props.item && !hasCanvasCapabilities(props.item) ? (
          <SurfaceBoundaryCard
            item={props.item}
            titleKey="CONTENT_SITE_BUILDER_BOUNDARY_TITLE"
            descriptionKey="CONTENT_SITE_BUILDER_BOUNDARY_DESC"
            requiredCapabilities={[...CANVAS_REQUIRED_CAPABILITIES]}
            testId="content-site-builder-boundary"
          />
        ) : null}
      </div>
    </DefaultPage>
  );
}
