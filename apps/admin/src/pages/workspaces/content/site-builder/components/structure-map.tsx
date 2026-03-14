import { Button, Card, Tag } from "antd";
import { ExternalLink } from "lucide-react";

import type { SiteBuilderStructureNode } from "@/api/content/site-builder";

type TranslationFn = (key: string, options?: Record<string, unknown>) => string;

type FlattenedStructureNode = {
  node: SiteBuilderStructureNode;
  depth: number;
};

function flattenNodes(
  nodes: readonly SiteBuilderStructureNode[],
  depth = 0,
): FlattenedStructureNode[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...flattenNodes(node.children ?? [], depth + 1),
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

function NodeStatusTag(props: { publishedRevision?: number | null; t: TranslationFn }) {
  const published = Boolean(props.publishedRevision);
  return (
    <Tag color={published ? "green" : "gold"}>
      {published
        ? props.t("content_library:SITE_BUILDER_STATUS_PUBLISHED")
        : props.t("content_library:SITE_BUILDER_STATUS_DRAFT")}
    </Tag>
  );
}

function StructureNodeRow(props: {
  item: FlattenedStructureNode;
  processing: boolean;
  onOpenEditor: (node: SiteBuilderStructureNode) => void;
  onPublish: (node: SiteBuilderStructureNode) => void;
  onUnpublish: (node: SiteBuilderStructureNode) => void;
  t: TranslationFn;
}) {
  const { item, processing, onOpenEditor, onPublish, onUnpublish, t } = props;
  const canPublish = Boolean(item.node.draftRevision);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border px-4 py-3">
      <div className="min-w-0" style={{ paddingLeft: `${item.depth * 14}px` }}>
        <div className="truncate text-body font-medium text-foreground">
          {item.node.title || item.node.path}
        </div>
        <div className="mt-1 truncate text-footnote text-label-secondary">{item.node.path}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <NodeStatusTag publishedRevision={item.node.publishedRevision} t={t} />
          <RevisionTag
            label={t("content_library:SITE_BUILDER_REVISION_DRAFT")}
            revision={item.node.draftRevision}
          />
          <RevisionTag
            label={t("content_library:SITE_BUILDER_REVISION_PUBLISHED")}
            revision={item.node.publishedRevision}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="default"
          autoInsertSpace={false}
          icon={<ExternalLink size={16} />}
          onClick={() => onOpenEditor(item.node)}
        >
          {t("content_library:SITE_BUILDER_OPEN_EDITOR")}
        </Button>
        {item.node.publishedRevision ? (
          <Button
            autoInsertSpace={false}
            loading={processing}
            disabled={processing}
            onClick={() => onUnpublish(item.node)}
          >
            {t("content_library:SITE_BUILDER_ACTION_UNPUBLISH")}
          </Button>
        ) : (
          <Button
            type="primary"
            autoInsertSpace={false}
            loading={processing}
            disabled={processing || !canPublish}
            onClick={() => onPublish(item.node)}
          >
            {t("content_library:SITE_BUILDER_ACTION_PUBLISH")}
          </Button>
        )}
      </div>
    </div>
  );
}

export function StructureMap(props: {
  nodes: readonly SiteBuilderStructureNode[];
  processingIds: ReadonlySet<string>;
  onOpenEditor: (node: SiteBuilderStructureNode) => void;
  onPublish: (node: SiteBuilderStructureNode) => void;
  onUnpublish: (node: SiteBuilderStructureNode) => void;
  t: TranslationFn;
}) {
  const rows = flattenNodes(props.nodes);

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
            <StructureNodeRow
              key={item.node.id}
              item={item}
              processing={props.processingIds.has(item.node.id)}
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
