import { Button } from "antd";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ContentGuard } from "@/components/common/content-guard";
import { DefaultPage } from "@/components/common/default-page";

import { CompositionPanel } from "./composition-panel";
import { CreateRouteTemplateDialog } from "./create-route-template-dialog";
import { CreateSitePageDialog } from "./create-site-page-dialog";
import { PublishImpactDrawer } from "./publish-impact-drawer";
import { RouteBindingsPanel } from "./route-bindings-panel";
import { SiteBuilderMetrics } from "./site-builder-metrics";
import { StructureMap } from "./structure-map";
import { useSiteBuilderController } from "./use-site-builder-controller";

export function SiteBuilderView() {
  const { t } = useTranslation(["content_library", "nav", "common"]);
  const model = useSiteBuilderController(t);

  return (
    <>
      <DefaultPage
        width="fixed"
        title={t("nav:NAV_CONTENT_SITE_BUILDER")}
        description={t("content_library:SITE_BUILDER_PAGE_DESC")}
        action={
          <Button
            type="primary"
            icon={<Plus size={16} />}
            autoInsertSpace={false}
            onClick={() => model.setDialogOpen(true)}
          >
            {t("content_library:SITE_BUILDER_MANAGE_PAGES")}
          </Button>
        }
      >
        <ContentGuard
          loading={model.queries.pagesQuery.isLoading}
          error={model.queries.pagesQuery.error}
          empty={false}
          onRetry={() => void model.queries.pagesQuery.refetch()}
          container="raw"
          hideRetry={model.pagesRepairable}
          errorTitle={
            model.pagesRepairable
              ? t("content_library:SITE_BUILDER_ROUTE_TREE_REPAIR_TITLE")
              : undefined
          }
          errorDescription={
            model.pagesRepairable
              ? t("content_library:SITE_BUILDER_ROUTE_TREE_REPAIR_DESC")
              : undefined
          }
          errorExtra={
            model.pagesRepairable ? (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="primary"
                  autoInsertSpace={false}
                  loading={model.repairPagesRouteTreeMutation.isPending}
                  disabled={model.repairPagesRouteTreeMutation.isPending}
                  onClick={() => void model.repairPagesRouteTreeMutation.mutateAsync()}
                >
                  {t("content_library:SITE_BUILDER_ROUTE_TREE_REPAIR_ACTION")}
                </Button>
                <Button
                  autoInsertSpace={false}
                  disabled={model.repairPagesRouteTreeMutation.isPending}
                  onClick={() => void model.queries.pagesQuery.refetch()}
                >
                  {t("common:RETRY")}
                </Button>
              </div>
            ) : undefined
          }
        >
          <div className="grid gap-4">
            <SiteBuilderMetrics
              draftCount={model.counts.totalPages - model.counts.publishedPages}
              globalCount={model.globalSections.length}
              pageCount={model.counts.totalPages}
              publishedCount={model.counts.publishedPages}
              routeCount={model.routeTemplates.length}
              t={t}
            />
            <PublishImpactDrawer
              error={model.queries.publishImpactQuery.error}
              impact={model.queries.publishImpactQuery.data}
              isLoading={model.queries.publishImpactQuery.isLoading}
              onRetry={() => void model.queries.publishImpactQuery.refetch()}
              t={t}
            />
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <StructureMap
                pages={model.pagesTree}
                processingIds={model.processingIds}
                onOpenEditor={model.openEditor}
                onPublish={(page) => void model.publishMutation.mutateAsync(page)}
                onUnpublish={(page) => void model.unpublishMutation.mutateAsync(page)}
                t={t}
              />
              <div className="grid gap-4">
                <CompositionPanel
                  error={model.queries.globalSectionsQuery.error}
                  isLoading={model.queries.globalSectionsQuery.isLoading}
                  items={model.globalSections}
                  onRetry={() => void model.queries.globalSectionsQuery.refetch()}
                  t={t}
                />
                <RouteBindingsPanel
                  error={model.queries.routeTemplatesQuery.error}
                  isLoading={model.queries.routeTemplatesQuery.isLoading}
                  items={model.routeTemplates}
                  processingIds={model.routeProcessingIds}
                  onCreate={() => model.setRouteDialogOpen(true)}
                  onRetry={() => void model.queries.routeTemplatesQuery.refetch()}
                  onToggleActive={(route) => void model.toggleRouteMutation.mutateAsync(route)}
                  t={t}
                />
              </div>
            </div>
          </div>
        </ContentGuard>
      </DefaultPage>

      <CreateSitePageDialog
        open={model.dialogOpen}
        confirmLoading={model.createMutation.isPending}
        onOpenChange={model.setDialogOpen}
        onConfirm={async (input) => {
          await model.createMutation.mutateAsync(input);
        }}
      />
      <CreateRouteTemplateDialog
        open={model.routeDialogOpen}
        confirmLoading={model.createRouteMutation.isPending}
        onOpenChange={model.setRouteDialogOpen}
        onConfirm={async (input) => {
          await model.createRouteMutation.mutateAsync(input);
        }}
      />
    </>
  );
}
