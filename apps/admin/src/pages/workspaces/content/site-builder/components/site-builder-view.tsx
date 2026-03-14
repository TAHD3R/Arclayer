import { Button } from "antd";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ContentGuard } from "@/components/common/content-guard";
import { WorkspaceContentShell } from "@/pages/workspaces/content/shared/content-shell";

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
  const modelOptions = model.siteBuilderModels.map((item) => ({
    value: item.key,
    label: item.name,
  }));
  const pageOptions = model.pagesTree.map((page) => ({
    value: page.id,
    label: page.title || page.path,
  }));

  return (
    <>
      <WorkspaceContentShell
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
      </WorkspaceContentShell>

      <CreateSitePageDialog
        open={model.dialogOpen}
        confirmLoading={model.createMutation.isPending}
        modelOptions={modelOptions}
        onOpenChange={model.setDialogOpen}
        onConfirm={async (input) => {
          await model.createMutation.mutateAsync(input);
        }}
      />
      <CreateRouteTemplateDialog
        open={model.routeDialogOpen}
        confirmLoading={model.createRouteMutation.isPending}
        itemOptions={pageOptions}
        onOpenChange={model.setRouteDialogOpen}
        onConfirm={async (input) => {
          await model.createRouteMutation.mutateAsync(input);
        }}
      />
    </>
  );
}
