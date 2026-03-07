import { Button, Card, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { ContentModelSummary } from "@/api/content-models";

type TranslationFn = (key: string, options?: Record<string, unknown>) => string;

export type LibraryRow = {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "published";
  updatedAt: string | null;
  draftRevision: number;
  publishedRevision: number | null;
  entryTypeCode: string;
};

export type LibraryEntrySource = {
  id: string;
  slug: string;
  draftRevision: number;
  entryTypeCode: string;
  title?: string | null;
  status?: string;
  updatedAt?: string;
  publishedRevision?: number | null;
};

const EMPTY_ROWS: LibraryRow[] = [];

function mapEntryToRow(entry: LibraryEntrySource): LibraryRow {
  return {
    id: entry.id,
    title: entry.title || entry.slug,
    slug: entry.slug,
    status: entry.publishedRevision ? "published" : "draft",
    updatedAt: entry.updatedAt ?? null,
    draftRevision: entry.draftRevision,
    publishedRevision: entry.publishedRevision ?? null,
    entryTypeCode: entry.entryTypeCode,
  };
}

function formatRevisionValue(revision: number | null): string {
  if (!revision) return "-";
  return `v${revision}`;
}

function buildLibraryColumns(opts: {
  formatUpdatedAt: (value: string | null) => string;
  processingIds: ReadonlySet<string>;
  onPublish: (row: LibraryRow) => void;
  onUnpublish: (row: LibraryRow) => void;
  t: TranslationFn;
}): ColumnsType<LibraryRow> {
  return [
    { title: opts.t("content_library:LIBRARY_TABLE_TITLE"), dataIndex: "title", key: "title" },
    { title: opts.t("content_library:LIBRARY_TABLE_SLUG"), dataIndex: "slug", key: "slug" },
    {
      title: opts.t("content_library:LIBRARY_TABLE_STATUS"),
      dataIndex: "status",
      key: "status",
      render: (_value, row) => (
        <Tag color={row.status === "published" ? "green" : "gold"}>
          {row.status === "published"
            ? opts.t("content_library:LIBRARY_STATUS_PUBLISHED")
            : opts.t("content_library:LIBRARY_STATUS_DRAFT")}
        </Tag>
      ),
    },
    {
      title: opts.t("content_library:LIBRARY_TABLE_DRAFT_REVISION"),
      dataIndex: "draftRevision",
      key: "draftRevision",
      render: (_value, row) => formatRevisionValue(row.draftRevision),
    },
    {
      title: opts.t("content_library:LIBRARY_TABLE_PUBLISHED_REVISION"),
      dataIndex: "publishedRevision",
      key: "publishedRevision",
      render: (_value, row) => formatRevisionValue(row.publishedRevision),
    },
    {
      title: opts.t("content_library:LIBRARY_TABLE_UPDATED"),
      dataIndex: "updatedAt",
      key: "updatedAt",
      render: (_value, row) => opts.formatUpdatedAt(row.updatedAt),
    },
    {
      title: opts.t("content_library:LIBRARY_TABLE_ACTIONS"),
      key: "actions",
      render: (_value, row) => {
        const processing = opts.processingIds.has(row.id);
        if (row.publishedRevision) {
          return (
            <Button
              size="small"
              autoInsertSpace={false}
              loading={processing}
              disabled={processing}
              onClick={() => opts.onUnpublish(row)}
            >
              {opts.t("content_library:LIBRARY_ACTION_UNPUBLISH")}
            </Button>
          );
        }

        return (
          <Button
            type="primary"
            size="small"
            autoInsertSpace={false}
            loading={processing}
            disabled={processing || row.draftRevision < 1}
            onClick={() => opts.onPublish(row)}
          >
            {opts.t("content_library:LIBRARY_ACTION_PUBLISH")}
          </Button>
        );
      },
    },
  ];
}

export function buildLibraryRows(items: readonly LibraryEntrySource[]): LibraryRow[] {
  return items.map(mapEntryToRow);
}

export function ContentLibraryMetrics(props: { rows: readonly LibraryRow[]; t: TranslationFn }) {
  const publishedCount = props.rows.filter((row) => row.publishedRevision).length;
  const draftOnlyCount = props.rows.length - publishedCount;
  const metrics = [
    { label: props.t("content_library:LIBRARY_METRIC_TOTAL"), value: props.rows.length },
    { label: props.t("content_library:LIBRARY_METRIC_DRAFT"), value: draftOnlyCount },
    { label: props.t("content_library:LIBRARY_METRIC_PUBLISHED"), value: publishedCount },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {metrics.map((metric) => (
        <div key={metric.label} className="rounded-xl border border-border bg-muted/20 p-4">
          <div className="text-footnote text-label-secondary">{metric.label}</div>
          <div className="mt-2 text-title1 text-foreground">{metric.value}</div>
        </div>
      ))}
    </div>
  );
}

export function ContentLibraryHeader(props: { model: ContentModelSummary; t: TranslationFn }) {
  return (
    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <div className="text-title2 text-foreground">{props.model.name}</div>
        <div className="text-body text-label-secondary">
          <span>{props.model.key}</span>
          <span className="mx-2 text-quaternary">·</span>
          <span>{props.model.defaultEditor}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {props.model.capabilities.map((capability) => (
          <Tag key={capability} variant="filled" className="m-0 rounded-md px-2 py-1">
            {capability}
          </Tag>
        ))}
      </div>
    </div>
  );
}

export function ContentLibraryEntryTable(props: {
  rows: readonly LibraryRow[];
  loading: boolean;
  processingIds: ReadonlySet<string>;
  formatUpdatedAt: (value: string | null) => string;
  onPublish: (row: LibraryRow) => void;
  onUnpublish: (row: LibraryRow) => void;
  t: TranslationFn;
}) {
  const columns = buildLibraryColumns({
    formatUpdatedAt: props.formatUpdatedAt,
    processingIds: props.processingIds,
    onPublish: props.onPublish,
    onUnpublish: props.onUnpublish,
    t: props.t,
  });

  return (
    <Table<LibraryRow>
      rowKey="id"
      columns={columns}
      dataSource={props.rows.length ? [...props.rows] : EMPTY_ROWS}
      loading={props.loading}
      pagination={false}
      locale={{ emptyText: props.t("content_library:LIBRARY_TABLE_EMPTY") }}
    />
  );
}

export function ContentLibraryCard(props: {
  children: React.ReactNode;
  model: ContentModelSummary;
  t: TranslationFn;
}) {
  return (
    <Card className="border-border shadow-none">
      <ContentLibraryHeader model={props.model} t={props.t} />
      {props.children}
    </Card>
  );
}
