import { Button, Card, Tag } from "antd";
import { ExternalLink } from "lucide-react";

import type { SiteBuilderPageNode } from "@/api/content/site-builder";

type TranslationFn = (key: string, options?: Record<string, unknown>) => string;

type FlattenedPage = {
  page: SiteBuilderPageNode;
  depth: number;
};

function flattenPages(nodes: readonly SiteBuilderPageNode[], depth = 0): FlattenedPage[] {
  return nodes.flatMap((node) => [
    { page: node, depth },
    ...flattenPages(node.children ?? [], depth + 1),
  ]);
}

function RevisionTag(props: { label: string; revision?: number | null }) {
  const value = props.revision ? `v${props.revision}` : "-";
  return (
    <Tag variant="filled" className="m-0 rounded-md bg-muted px-2 py-0.5 text-footnote">
      {props.label} {value}
    </Tag>
  );
}

function PageStatusTag(props: { publishedRevision?: number | null; t: TranslationFn }) {
  const published = Boolean(props.publishedRevision);
  return (
    <Tag color={published ? "green" : "gold"}>
      {published
        ? props.t("content_library:SITE_BUILDER_STATUS_PUBLISHED")
        : props.t("content_library:SITE_BUILDER_STATUS_DRAFT")}
    </Tag>
  );
}

function StructurePageRow(props: {
  item: FlattenedPage;
  processing: boolean;
  onOpenEditor: (page: SiteBuilderPageNode) => void;
  onPublish: (page: SiteBuilderPageNode) => void;
  onUnpublish: (page: SiteBuilderPageNode) => void;
  t: TranslationFn;
}) {
  const { item, processing, onOpenEditor, onPublish, onUnpublish, t } = props;
  const canPublish = Boolean(item.page.draftRevision);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border px-4 py-3">
      <div className="min-w-0" style={{ paddingLeft: `${item.depth * 14}px` }}>
        <div className="truncate text-body font-medium text-foreground">
          {item.page.title || item.page.path}
        </div>
        <div className="mt-1 truncate text-footnote text-label-secondary">{item.page.path}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PageStatusTag publishedRevision={item.page.publishedRevision} t={t} />
          <RevisionTag
            label={t("content_library:SITE_BUILDER_REVISION_DRAFT")}
            revision={item.page.draftRevision}
          />
          <RevisionTag
            label={t("content_library:SITE_BUILDER_REVISION_PUBLISHED")}
            revision={item.page.publishedRevision}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="default"
          autoInsertSpace={false}
          icon={<ExternalLink size={16} />}
          onClick={() => onOpenEditor(item.page)}
        >
          {t("content_library:SITE_BUILDER_OPEN_EDITOR")}
        </Button>
        {item.page.publishedRevision ? (
          <Button
            autoInsertSpace={false}
            loading={processing}
            disabled={processing}
            onClick={() => onUnpublish(item.page)}
          >
            {t("content_library:SITE_BUILDER_ACTION_UNPUBLISH")}
          </Button>
        ) : (
          <Button
            type="primary"
            autoInsertSpace={false}
            loading={processing}
            disabled={processing || !canPublish}
            onClick={() => onPublish(item.page)}
          >
            {t("content_library:SITE_BUILDER_ACTION_PUBLISH")}
          </Button>
        )}
      </div>
    </div>
  );
}

export function StructureMap(props: {
  pages: readonly SiteBuilderPageNode[];
  processingIds: ReadonlySet<string>;
  onOpenEditor: (page: SiteBuilderPageNode) => void;
  onPublish: (page: SiteBuilderPageNode) => void;
  onUnpublish: (page: SiteBuilderPageNode) => void;
  t: TranslationFn;
}) {
  const rows = flattenPages(props.pages);

  return (
    <Card className="border-border shadow-none">
      <div className="mb-4">
        <div className="text-title2 text-foreground">
          {props.t("content_library:SITE_BUILDER_STRUCTURE_MAP_TITLE")}
        </div>
        <div className="text-body text-label-secondary">
          {props.t("content_library:SITE_BUILDER_STRUCTURE_MAP_DESC")}
        </div>
      </div>
      <div className="grid gap-3">
        {rows.length ? (
          rows.map((item) => (
            <StructurePageRow
              key={item.page.id}
              item={item}
              processing={props.processingIds.has(item.page.id)}
              onOpenEditor={props.onOpenEditor}
              onPublish={props.onPublish}
              onUnpublish={props.onUnpublish}
              t={props.t}
            />
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-body text-label-secondary">
            {props.t("content_library:SITE_BUILDER_EMPTY_DESC")}
          </div>
        )}
      </div>
    </Card>
  );
}
