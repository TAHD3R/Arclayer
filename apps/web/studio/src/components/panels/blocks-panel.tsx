import type { ViewerContext } from "@celestial/site-block-protocol";
import { resolveLocalizedValue } from "@celestial/site-block-protocol";
import { Input, Select, Space, Typography, List, Button, Tag } from "antd";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { PrefabRegistryV1 } from "@celestial/site-renderer-core";

type BlockCategory =
  | "all"
  | "layout"
  | "text"
  | "media"
  | "data"
  | "navigation"
  | "interactive"
  | "custom";

export function BlocksPanel(props: {
  prefabRegistry: PrefabRegistryV1;
  ctx: ViewerContext;
  onInsertPrefab: (prefabId: string) => void;
}) {
  const { t, i18n } = useTranslation(["editor"]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<BlockCategory>("all");

  const prefabs = useMemo(() => {
    const q = query.trim().toLowerCase();
    const locale = (i18n.language || "").trim() || "en-US";
    const fallbackLocale = props.ctx.fallbackLocale || "en-US";
    const defLocale = props.ctx.locale || "en-US";

    return props.prefabRegistry
      .list()
      .map((def) => {
        const label =
          resolveLocalizedValue(def.manifest.label, { locale, fallbackLocale }) ||
          resolveLocalizedValue(def.manifest.label, { locale: defLocale, fallbackLocale }) ||
          def.prefabId;
        const cat = def.manifest.category;
        return {
          prefabId: def.prefabId,
          label,
          category: cat,
          manifestType: def.manifest.type,
        };
      })
      .filter((x) => (category === "all" ? true : x.category === category))
      .filter((x) => {
        if (!q) return true;
        return (
          x.prefabId.toLowerCase().includes(q) ||
          x.label.toLowerCase().includes(q) ||
          x.manifestType.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [
    category,
    i18n.language,
    props.ctx.fallbackLocale,
    props.ctx.locale,
    props.prefabRegistry,
    query,
  ]);

  const categoryOptions = useMemo(
    () => [
      { value: "all", label: t("editor:EDITOR_BLOCKS_CATEGORY_ALL") },
      { value: "layout", label: t("editor:EDITOR_BLOCKS_CATEGORY_LAYOUT") },
      { value: "text", label: t("editor:EDITOR_BLOCKS_CATEGORY_TEXT") },
      { value: "media", label: t("editor:EDITOR_BLOCKS_CATEGORY_MEDIA") },
      { value: "data", label: t("editor:EDITOR_BLOCKS_CATEGORY_DATA") },
      { value: "navigation", label: t("editor:EDITOR_BLOCKS_CATEGORY_NAVIGATION") },
      { value: "interactive", label: t("editor:EDITOR_BLOCKS_CATEGORY_INTERACTIVE") },
      { value: "custom", label: t("editor:EDITOR_BLOCKS_CATEGORY_CUSTOM") },
    ],
    [t],
  );

  return (
    <Space direction="vertical" size={12} className="w-full">
      <Typography.Title level={5} style={{ margin: 0 }}>
        {t("editor:EDITOR_LEFT_MENU_BLOCKS")}
      </Typography.Title>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        allowClear
        placeholder={t("editor:EDITOR_BLOCKS_SEARCH_PLACEHOLDER")}
      />

      <Select
        value={category}
        onChange={(v) => setCategory((String(v) as BlockCategory) || "all")}
        options={categoryOptions}
        className="w-full"
      />

      <List
        size="small"
        bordered
        dataSource={prefabs}
        locale={{ emptyText: t("editor:EDITOR_BLOCKS_EMPTY") }}
        renderItem={(item) => (
          <List.Item
            actions={[
              <Button
                key="insert"
                size="small"
                type="primary"
                onClick={() => props.onInsertPrefab(item.prefabId)}
              >
                {t("editor:EDITOR_BLOCKS_INSERT")}
              </Button>,
            ]}
          >
            <Space direction="vertical" size={2}>
              <Typography.Text strong>{item.label}</Typography.Text>
              <Space size={6} wrap>
                <Typography.Text type="secondary" className="text-xs">
                  {item.prefabId}
                </Typography.Text>
                <Tag>{item.category}</Tag>
              </Space>
            </Space>
          </List.Item>
        )}
      />
    </Space>
  );
}
