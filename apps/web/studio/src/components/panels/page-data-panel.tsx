import type { PageBlueprint } from "@celestial/site-block-protocol";
import { Alert, Select, Space, Typography } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { listWorkspaceContentEntries } from "@/api/content-entries";
import { listWorkspaceContentTypes } from "@/api/content-types";
import { readPageRootDataSources, updatePageRootDataSources } from "@/lib/page-blueprint";
import type { ContentEntryOut, ContentTypeOut } from "@/types/api";

export function PageDataPanel(props: {
  workspaceId: string;
  doc: PageBlueprint;
  onChangeDoc: (next: PageBlueprint) => void;
}) {
  const { t } = useTranslation(["editor"]);
  const workspaceId = props.workspaceId.trim();

  const rootDs = useMemo(() => readPageRootDataSources(props.doc), [props.doc]);
  const primaryEntryTypeHint = (rootDs.primaryEntryTypeHint ?? "").trim();
  const primaryEntryId = (rootDs.primaryEntryId ?? "").trim();

  const contentTypesQuery = useQuery({
    queryKey: ["workspace", workspaceId, "content", "types"],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const res = await listWorkspaceContentTypes(workspaceId, { page: 1, size: 200 });
      return (res.items ?? []) as ContentTypeOut[];
    },
    staleTime: 2 * 60 * 1000,
  });

  const entriesQuery = useQuery({
    queryKey: ["workspace", workspaceId, "content", "entries", primaryEntryTypeHint || "*"],
    enabled: Boolean(workspaceId) && Boolean(primaryEntryTypeHint),
    queryFn: async () => {
      const res = await listWorkspaceContentEntries(workspaceId, {
        page: 1,
        size: 200,
        typeCode: primaryEntryTypeHint,
      });
      return (res.items ?? []) as ContentEntryOut[];
    },
    staleTime: 30 * 1000,
  });

  const typeOptions = useMemo(() => {
    const items = contentTypesQuery.data ?? [];
    return items
      .filter((x) => String(x.code || "").trim())
      .map((x) => ({
        value: String(x.code),
        label: `${x.name} (${x.code})`,
      }));
  }, [contentTypesQuery.data]);

  const entryOptions = useMemo(() => {
    const items = entriesQuery.data ?? [];
    return items.map((x) => {
      const title = (x.title || "").trim();
      const slug = (x.slug || "").trim();
      const labelBase = title || slug || x.id;
      const suffix = x.path ? `${x.path}` : x.locale ? `${x.locale}` : "";
      return {
        value: x.id,
        label: suffix ? `${labelBase} — ${suffix}` : labelBase,
      };
    });
  }, [entriesQuery.data]);

  const applyPatch = (patch: Parameters<typeof updatePageRootDataSources>[1]) => {
    props.onChangeDoc(updatePageRootDataSources(props.doc, patch));
  };

  return (
    <Space direction="vertical" size={12} className="w-full">
      <Typography.Title level={5} style={{ margin: 0 }}>
        {t("editor:EDITOR_DATA_PANEL_TITLE")}
      </Typography.Title>

      <Alert
        type="info"
        showIcon
        message={t("editor:EDITOR_DATA_PANEL_HINT_TITLE")}
        description={t("editor:EDITOR_DATA_PANEL_HINT_DESC")}
      />

      <div>
        <Typography.Text type="secondary">{t("editor:EDITOR_DATA_PRIMARY_TYPE")}</Typography.Text>
        <Select
          className="mt-2 w-full"
          value={primaryEntryTypeHint || undefined}
          placeholder={t("editor:EDITOR_DATA_PRIMARY_TYPE_PLACEHOLDER")}
          options={typeOptions}
          loading={contentTypesQuery.isLoading}
          showSearch
          optionFilterProp="label"
          onChange={(v) => applyPatch({ primaryEntryTypeHint: v ? String(v) : null })}
          allowClear
        />
        {!primaryEntryTypeHint ? (
          <Typography.Text type="secondary" className="mt-1 block text-xs">
            {t("editor:EDITOR_DATA_PRIMARY_TYPE_HELP")}
          </Typography.Text>
        ) : null}
      </div>

      <div>
        <Typography.Text type="secondary">{t("editor:EDITOR_DATA_PRIMARY_ENTRY")}</Typography.Text>
        <Select
          className="mt-2 w-full"
          value={primaryEntryId || undefined}
          placeholder={
            primaryEntryTypeHint
              ? t("editor:EDITOR_DATA_PRIMARY_ENTRY_PLACEHOLDER")
              : t("editor:EDITOR_DATA_PRIMARY_ENTRY_PLACEHOLDER_NEED_TYPE")
          }
          options={entryOptions}
          loading={entriesQuery.isLoading}
          disabled={!primaryEntryTypeHint}
          showSearch
          optionFilterProp="label"
          onChange={(v) => applyPatch({ primaryEntryId: v ? String(v) : null })}
          allowClear
        />
        <Typography.Text type="secondary" className="mt-1 block text-xs">
          {t("editor:EDITOR_DATA_PRIMARY_ENTRY_HELP")}
        </Typography.Text>
      </div>
    </Space>
  );
}
