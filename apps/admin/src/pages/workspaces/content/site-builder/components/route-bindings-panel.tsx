import { Button, Card, Tag } from "antd";

import { ContentGuard } from "@/components/common/content-guard";
import type { SiteBuilderRouteTemplate } from "@/api/content/site-builder";

type TranslationFn = (key: string, options?: Record<string, unknown>) => string;

function RouteBindingRow(props: {
  route: SiteBuilderRouteTemplate;
  processing: boolean;
  onToggleActive: (route: SiteBuilderRouteTemplate) => void;
  t: TranslationFn;
}) {
  const { route, processing, onToggleActive, t } = props;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="truncate font-medium text-foreground">{route.pathPattern}</div>
        <div className="truncate text-footnote text-label-secondary">{route.entryTypeCode}</div>
      </div>
      <div className="flex items-center gap-2">
        <Tag color={route.isActive ? "green" : "default"}>
          {route.isActive
            ? t("content_library:SITE_BUILDER_ROUTE_ACTIVE")
            : t("content_library:SITE_BUILDER_ROUTE_INACTIVE")}
        </Tag>
        <Button
          autoInsertSpace={false}
          loading={processing}
          disabled={processing}
          onClick={() => onToggleActive(route)}
        >
          {route.isActive
            ? t("content_library:SITE_BUILDER_ROUTE_ACTION_DISABLE")
            : t("content_library:SITE_BUILDER_ROUTE_ACTION_ENABLE")}
        </Button>
      </div>
    </div>
  );
}

export function RouteBindingsPanel(props: {
  error: unknown;
  isLoading: boolean;
  items: readonly SiteBuilderRouteTemplate[];
  onCreate: () => void;
  onRetry: () => void;
  onToggleActive: (route: SiteBuilderRouteTemplate) => void;
  processingIds: ReadonlySet<string>;
  t: TranslationFn;
}) {
  return (
    <Card className="border-border shadow-none">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-title2 text-foreground">
            {props.t("content_library:SITE_BUILDER_ROUTE_BINDINGS_TITLE")}
          </div>
          <div className="text-body text-label-secondary">
            {props.t("content_library:SITE_BUILDER_ROUTE_BINDINGS_DESC")}
          </div>
        </div>
        <Button type="text" autoInsertSpace={false} onClick={props.onCreate}>
          {props.t("content_library:SITE_BUILDER_MANAGE_ROUTES")}
        </Button>
      </div>
      <ContentGuard
        loading={props.isLoading}
        error={props.error}
        empty={false}
        onRetry={props.onRetry}
        container="raw"
      >
        <div className="grid gap-3">
          {props.items.length ? (
            props.items.map((route) => (
              <RouteBindingRow
                key={route.id}
                route={route}
                processing={props.processingIds.has(route.id)}
                onToggleActive={props.onToggleActive}
                t={props.t}
              />
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-border px-4 py-6 text-body text-label-secondary">
              {props.t("content_library:SITE_BUILDER_ROUTES_EMPTY")}
            </div>
          )}
        </div>
      </ContentGuard>
    </Card>
  );
}
