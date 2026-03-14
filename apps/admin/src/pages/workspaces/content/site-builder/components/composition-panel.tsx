import { Card, Tag } from "antd";
import { LayoutPanelTop } from "lucide-react";

import { ContentGuard } from "@/components/common/content-guard";
import type { SiteBuilderGlobalSection } from "@/api/content/site-builder";

type TranslationFn = (key: string, options?: Record<string, unknown>) => string;

export function CompositionPanel(props: {
  error: unknown;
  isLoading: boolean;
  items: readonly SiteBuilderGlobalSection[];
  onRetry: () => void;
  t: TranslationFn;
}) {
  return (
    <Card className="border-border shadow-none">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-title2 text-foreground">
            {props.t("content_library:SITE_BUILDER_COMPOSITION_PANEL_TITLE")}
          </div>
          <div className="text-body text-label-secondary">
            {props.t("content_library:SITE_BUILDER_COMPOSITION_PANEL_DESC")}
          </div>
        </div>
        <LayoutPanelTop className="size-5 text-label-secondary" />
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
            props.items.map((section) => (
              <div
                key={section.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-body font-medium text-foreground">
                    {section.name}
                  </div>
                  <div className="truncate text-footnote text-label-secondary">{section.kind}</div>
                </div>
                <Tag color={section.enabled ? "green" : "default"}>
                  {section.enabled
                    ? props.t("content_library:SITE_BUILDER_GLOBAL_ENABLED")
                    : props.t("content_library:SITE_BUILDER_GLOBAL_DISABLED")}
                </Tag>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-border px-4 py-6 text-body text-label-secondary">
              {props.t("content_library:SITE_BUILDER_GLOBALS_EMPTY")}
            </div>
          )}
        </div>
      </ContentGuard>
    </Card>
  );
}
