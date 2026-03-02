import type { DesignBindingExprV1, DesignBindingSourceV1 } from "@celestial/site-block-protocol";
import { Alert, Button, Input, Select, Space, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { listWorkspaceContentTypes } from "@/api/content-types";
import type { ContentTypeOut } from "@/types/api";
import {
  buildPrimaryEntryBindingPathOptions,
  parseContentTypeFieldSchema,
} from "@/lib/binding/primary-entry-paths";

const SOURCE_OPTIONS: Array<{ value: DesignBindingSourceV1; labelKey: string; example: string }> = [
  {
    value: "primaryEntry",
    labelKey: "editor:EDITOR_BINDING_SOURCE_PRIMARY",
    example: "fields.title",
  },
  { value: "routeParams", labelKey: "editor:EDITOR_BINDING_SOURCE_ROUTE", example: "slug" },
  { value: "site", labelKey: "editor:EDITOR_BINDING_SOURCE_SITE", example: "name" },
  { value: "viewer", labelKey: "editor:EDITOR_BINDING_SOURCE_VIEWER", example: "locale" },
  { value: "prefabProps", labelKey: "editor:EDITOR_BINDING_SOURCE_PREFAB", example: "title" },
];

export function DesignBindingExprField(props: {
  value: DesignBindingExprV1;
  allowedSources?: DesignBindingSourceV1[];
  onChange: (next: DesignBindingExprV1) => void;
  /**
   * Studio-only: used to offer primaryEntry field path suggestions, backed by ContentType.fieldSchema.
   */
  workspaceId?: string | null;
  primaryEntryTypeHint?: string | null;
  defaultLocale?: string | null;
  /**
   * Show an inline hint/warning when the binding may not resolve in the current mode.
   */
  hint?: string | null;
}) {
  const { t, i18n } = useTranslation(["editor"]);
  const allowed = props.allowedSources?.length ? new Set(props.allowedSources) : null;
  const options = useMemo(() => {
    return SOURCE_OPTIONS.filter((opt) => (allowed ? allowed.has(opt.value) : true)).map((opt) => ({
      value: opt.value,
      label: t(opt.labelKey),
      example: opt.example,
    }));
  }, [allowed, t]);

  const currentSource = props.value.source;
  const currentPath = props.value.path;
  const isPrimaryEntry = currentSource === "primaryEntry";
  const workspaceId = (props.workspaceId ?? "").trim();
  const primaryEntryTypeHint = (props.primaryEntryTypeHint ?? "").trim();
  const defaultLocale = (props.defaultLocale ?? "").trim() || "en-US";

  const [pathDraft, setPathDraft] = useState<string>(currentPath);
  const [pathError, setPathError] = useState<string | null>(null);
  const [manualPathMode, setManualPathMode] = useState(false);

  useEffect(() => {
    setPathDraft(currentPath);
    setPathError(null);
    setManualPathMode(false);
  }, [currentPath, currentSource]);

  const sourceOption = options.find((o) => o.value === currentSource) ?? options[0];
  const example = sourceOption?.example ?? "fields.title";

  const contentTypesQuery = useQuery({
    queryKey: ["workspace", workspaceId, "content", "types"],
    enabled: isPrimaryEntry && Boolean(workspaceId),
    queryFn: async () => {
      const res = await listWorkspaceContentTypes(workspaceId, { page: 1, size: 200 });
      const items = res.items ?? [];
      return items as ContentTypeOut[];
    },
    staleTime: 2 * 60 * 1000,
  });

  const primaryEntrySchema = useMemo(() => {
    if (!isPrimaryEntry) return null;
    if (!primaryEntryTypeHint) return null;
    const items = contentTypesQuery.data ?? [];
    const found = items.find((x) => String(x.code || "").trim() === primaryEntryTypeHint) ?? null;
    return parseContentTypeFieldSchema(found?.fieldSchema);
  }, [contentTypesQuery.data, isPrimaryEntry, primaryEntryTypeHint]);

  const primaryEntryPathOptions = useMemo(() => {
    if (!primaryEntrySchema) return [];
    const labelLocale = (i18n.language || "").trim() || "en-US";
    return buildPrimaryEntryBindingPathOptions({
      schema: primaryEntrySchema,
      labelLocale,
      defaultLocale,
      maxDepth: 5,
    });
  }, [defaultLocale, i18n.language, primaryEntrySchema]);

  const setSource = (source: DesignBindingSourceV1) => {
    const opt = options.find((o) => o.value === source);
    const nextPath = (pathDraft || "").trim() || (opt?.example ?? "fields.title");
    props.onChange({ kind: "binding", source, path: nextPath });
  };

  const setPath = (next: string) => {
    setPathDraft(next);
    const trimmed = (next || "").trim();
    if (!trimmed) {
      setPathError(t("editor:EDITOR_BINDING_PATH_REQUIRED"));
      return;
    }
    setPathError(null);
    props.onChange({ kind: "binding", source: currentSource, path: trimmed });
  };

  const pathSelectOptions = useMemo(() => {
    if (!isPrimaryEntry) return [];
    const base = primaryEntryPathOptions;
    if (!currentPath.trim()) return base;
    if (base.some((x) => x.value === currentPath.trim())) return base;
    return [
      {
        value: currentPath.trim(),
        label: t("editor:EDITOR_BINDING_PATH_CUSTOM", { path: currentPath.trim() }),
      },
      ...base,
    ];
  }, [currentPath, isPrimaryEntry, primaryEntryPathOptions, t]);

  const suggestedPathOptions = useMemo(() => {
    const mk = (value: string, label?: string) => ({ value, label: label ?? value });
    if (currentSource === "viewer") {
      return [mk("locale"), mk("fallbackLocale"), mk("breakpoint"), mk("mode")];
    }
    if (currentSource === "site") {
      return [
        mk("name"),
        mk("subtitle"),
        mk("description"),
        mk("url"),
        mk("logoUrl"),
        mk("faviconUrl"),
        mk("contactEmail"),
        mk("defaultLocale"),
        mk("fallbackLocale"),
        mk("supportedLocales"),
        mk("timezone"),
        mk("seoDefaultTitle"),
        mk("seoDefaultDescription"),
      ];
    }
    if (currentSource === "routeParams") {
      return [mk("slug"), mk("path"), mk("pageId"), mk("locale")];
    }
    if (currentSource === "prefabProps") {
      return [mk("title"), mk("description"), mk("imageSrc"), mk("href"), mk("buttonText")];
    }
    return [];
  }, [currentSource]);

  return (
    <Space direction="vertical" size={10} className="w-full">
      {props.hint ? <Alert type="info" showIcon message={props.hint} /> : null}

      <div>
        <Typography.Text type="secondary">{t("editor:EDITOR_BINDING_SOURCE")}</Typography.Text>
        <Select
          className="mt-2 w-full"
          value={currentSource}
          options={options.map((o) => ({ value: o.value, label: o.label }))}
          onChange={(v) => setSource(v as DesignBindingSourceV1)}
        />
      </div>

      {isPrimaryEntry && !primaryEntryTypeHint ? (
        <Alert
          type="warning"
          showIcon
          message={t("editor:EDITOR_BINDING_PRIMARY_MISSING_TYPE_TITLE")}
          description={t("editor:EDITOR_BINDING_PRIMARY_MISSING_TYPE_DESC")}
        />
      ) : null}

      {!isPrimaryEntry && suggestedPathOptions.length ? (
        <div>
          <Typography.Text type="secondary">
            {t("editor:EDITOR_BINDING_PATH_SUGGESTIONS")}
          </Typography.Text>
          <Select
            className="mt-2 w-full"
            size="small"
            value={undefined}
            placeholder={t("editor:EDITOR_BINDING_PATH_SUGGESTIONS_PLACEHOLDER")}
            options={suggestedPathOptions}
            showSearch
            optionFilterProp="label"
            onChange={(v) => setPath(String(v))}
          />
        </div>
      ) : null}

      <div>
        <Typography.Text type="secondary">{t("editor:EDITOR_BINDING_PATH")}</Typography.Text>
        {isPrimaryEntry &&
        primaryEntryTypeHint &&
        primaryEntryPathOptions.length &&
        !manualPathMode ? (
          <div className="mt-2">
            <Select
              className="w-full"
              value={pathDraft}
              placeholder={t("editor:EDITOR_BINDING_PATH_SELECT_PLACEHOLDER")}
              options={pathSelectOptions}
              showSearch
              optionFilterProp="label"
              onChange={(v) => setPath(String(v))}
            />
            <div className="mt-1 flex items-center justify-between">
              <Typography.Text type="secondary" className="text-xs">
                {t("editor:EDITOR_BINDING_PATH_SELECT_HINT")}
              </Typography.Text>
              <Button size="small" type="link" onClick={() => setManualPathMode(true)}>
                {t("editor:EDITOR_BINDING_PATH_MANUAL")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-2">
            <Input
              value={pathDraft}
              placeholder={t("editor:EDITOR_BINDING_PATH_PLACEHOLDER", { example })}
              onChange={(e) => setPath(e.target.value)}
            />
            {isPrimaryEntry &&
            primaryEntryTypeHint &&
            primaryEntryPathOptions.length &&
            manualPathMode ? (
              <div className="mt-1 flex justify-end">
                <Button size="small" type="link" onClick={() => setManualPathMode(false)}>
                  {t("editor:EDITOR_BINDING_PATH_SELECT")}
                </Button>
              </div>
            ) : null}
          </div>
        )}
        {pathError ? (
          <Typography.Text type="danger" className="mt-1 block text-xs">
            {pathError}
          </Typography.Text>
        ) : (
          <Typography.Text type="secondary" className="mt-1 block text-xs">
            {t("editor:EDITOR_BINDING_EXAMPLE", { example })}
          </Typography.Text>
        )}
      </div>
    </Space>
  );
}
