import type {
  DesignBindingExprV1,
  DesignBindingSourceV1,
  DesignContentRefNodeV1,
  DesignImageNodeV1,
  DesignNodeV1,
  DesignPageRootNodeV1,
  DesignPrefabInstanceNodeV1,
  DesignTextNodeV1,
  DesignValueV1,
  FieldDefinition,
  LocalizedString,
  PageBlueprint,
  JsonValue,
} from "@celestial/block-protocol";
import { Drawer, Input, InputNumber, Select, Space, Switch, Typography, Alert, Button } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { PrefabRegistryV1 } from "@celestial/renderer";

import { DesignBindingExprField } from "@/components/binding/design-binding-expr-field";
import { LocalizedStringField } from "@/components/i18n/localized-string-field";
import { clonePageBlueprint, readPageRootDataSources } from "@/lib/page-blueprint";

export function NodeInspectorDrawer(props: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  doc: PageBlueprint;
  nodeId: string | null;
  prefabRegistry: PrefabRegistryV1;
  supportedLocales: string[];
  defaultLocale: string;
  onChangeDoc: (next: PageBlueprint) => void;
}) {
  const { t } = useTranslation(["editor"]);
  const node = props.nodeId ? props.doc.nodesById[props.nodeId] : null;

  const title = node
    ? t("editor:EDITOR_NODE_INSPECTOR_TITLE_WITH_TYPE", {
        type: t(`editor:EDITOR_NODE_TYPE_${node.type.toUpperCase()}` as any),
      })
    : t("editor:EDITOR_NODE_INSPECTOR_TITLE");

  return (
    <Drawer open={props.open} onClose={props.onClose} title={title} width={420} destroyOnClose>
      <NodeInspectorPanel
        workspaceId={props.workspaceId}
        doc={props.doc}
        nodeId={props.nodeId}
        prefabRegistry={props.prefabRegistry}
        supportedLocales={props.supportedLocales}
        defaultLocale={props.defaultLocale}
        onChangeDoc={props.onChangeDoc}
        header={false}
      />
    </Drawer>
  );
}

export function NodeInspectorPanel(props: {
  workspaceId: string;
  doc: PageBlueprint;
  nodeId: string | null;
  prefabRegistry: PrefabRegistryV1;
  supportedLocales: string[];
  defaultLocale: string;
  onChangeDoc: (next: PageBlueprint) => void;
  header?: boolean;
}) {
  const { t, i18n } = useTranslation(["editor"]);
  const node = props.nodeId ? props.doc.nodesById[props.nodeId] : null;

  const rootDs = useMemo(() => readPageRootDataSources(props.doc), [props.doc]);
  const primaryEntryTypeHint = (rootDs.primaryEntryTypeHint ?? "").trim() || null;

  const supportedLocales = props.supportedLocales?.length
    ? props.supportedLocales
    : [props.defaultLocale];

  const updateNode = (patcher: (draft: DesignNodeV1) => void) => {
    if (!props.nodeId) return;
    const next = clonePageBlueprint(props.doc);
    const draft = next.nodesById[props.nodeId];
    if (!draft) return;
    patcher(draft);
    props.onChangeDoc(next);
  };

  const title = node
    ? t("editor:EDITOR_NODE_INSPECTOR_TITLE_WITH_TYPE", {
        type: t(`editor:EDITOR_NODE_TYPE_${node.type.toUpperCase()}` as any),
      })
    : t("editor:EDITOR_NODE_INSPECTOR_TITLE");

  const localeForLabel = (value: LocalizedString): string => {
    const loc = (i18n.language || "").trim() || "en-US";
    return value[loc] || value[props.defaultLocale] || Object.values(value)[0] || "";
  };

  const prefabManifest = useMemo(() => {
    if (!node || node.type !== "prefab_instance") return null;
    const def = props.prefabRegistry.get(node.prefabId);
    return def?.manifest ?? null;
  }, [node, props.prefabRegistry]);

  return (
    <div className="flex h-full flex-col">
      {props.header !== false ? (
        <div className="border-b border-border bg-card px-4 py-3">
          <Typography.Text strong>{title}</Typography.Text>
        </div>
      ) : null}

      <div className="flex-1 overflow-auto px-4 py-4">
        {!node ? (
          <Typography.Text type="secondary">
            {t("editor:EDITOR_NODE_INSPECTOR_EMPTY")}
          </Typography.Text>
        ) : (
          <Space direction="vertical" size={14} className="w-full">
            <div>
              <Typography.Text type="secondary" className="text-xs">
                {t("editor:EDITOR_NODE_INSPECTOR_NODE_ID")}
              </Typography.Text>
              <div className="mt-1">
                <Typography.Text className="font-mono">{node.id}</Typography.Text>
              </div>
            </div>

            {node.type === "page_root" ? (
              <PageRootInspector
                node={node}
                workspaceId={props.workspaceId}
                primaryEntryTypeHint={primaryEntryTypeHint}
                supportedLocales={supportedLocales}
                defaultLocale={props.defaultLocale}
                onChange={(next) => updateNode((draft) => Object.assign(draft, next))}
              />
            ) : null}

            {node.type === "text" ? (
              <TextNodeInspector
                node={node}
                workspaceId={props.workspaceId}
                primaryEntryTypeHint={primaryEntryTypeHint}
                supportedLocales={supportedLocales}
                defaultLocale={props.defaultLocale}
                onChange={(next) => updateNode((draft) => Object.assign(draft, next))}
              />
            ) : null}

            {node.type === "image" ? (
              <ImageNodeInspector
                node={node}
                workspaceId={props.workspaceId}
                primaryEntryTypeHint={primaryEntryTypeHint}
                supportedLocales={supportedLocales}
                defaultLocale={props.defaultLocale}
                onChange={(next) => updateNode((draft) => Object.assign(draft, next))}
              />
            ) : null}

            {node.type === "prefab_instance" ? (
              <PrefabInstanceInspector
                node={node}
                workspaceId={props.workspaceId}
                primaryEntryTypeHint={primaryEntryTypeHint}
                supportedLocales={supportedLocales}
                defaultLocale={props.defaultLocale}
                manifestFields={prefabManifest?.attributes ?? []}
                labelForField={(f) => localeForLabel(f.label)}
                onChangeProps={(nextProps) =>
                  updateNode((draft) => {
                    if (draft.type !== "prefab_instance") return;
                    draft.props = nextProps;
                  })
                }
              />
            ) : null}

            {node.type === "prefab_instance" ? (
              <PrefabInstanceStyleInspector
                node={node}
                styleOverrideWhitelist={prefabManifest?.styleOverrideWhitelist ?? []}
                onChangeStyle={(nextStyle) =>
                  updateNode((draft) => {
                    if (draft.type !== "prefab_instance") return;
                    draft.style = nextStyle;
                  })
                }
              />
            ) : null}

            {node.type === "content_ref" ? (
              <ContentRefNodeInspector
                node={node}
                workspaceId={props.workspaceId}
                primaryEntryTypeHint={primaryEntryTypeHint}
                supportedLocales={supportedLocales}
                defaultLocale={props.defaultLocale}
                onChange={(next) => updateNode((draft) => Object.assign(draft, next))}
              />
            ) : null}

            {!["page_root", "text", "image", "prefab_instance", "content_ref"].includes(
              node.type,
            ) ? (
              <Alert
                type="info"
                showIcon
                message={t("editor:EDITOR_NODE_INSPECTOR_UNSUPPORTED_TITLE")}
                description={t("editor:EDITOR_NODE_INSPECTOR_UNSUPPORTED_DESC")}
              />
            ) : null}
          </Space>
        )}
      </div>
    </div>
  );
}

function PageRootInspector(props: {
  node: DesignPageRootNodeV1;
  workspaceId: string;
  primaryEntryTypeHint: string | null;
  supportedLocales: string[];
  defaultLocale: string;
  onChange: (next: Partial<DesignPageRootNodeV1>) => void;
}) {
  const { t } = useTranslation(["editor"]);

  const seo = props.node.seo ?? {};
  const titleValue = seo.title;
  const descValue = seo.description;

  const titleIsBinding = Boolean(titleValue && isBindingExpr(titleValue));
  const titleMode = titleIsBinding ? "binding" : "literal";
  const titleBinding = titleIsBinding ? (titleValue as DesignBindingExprV1) : null;
  const titleLocalized = titleValue && !titleIsBinding ? (titleValue as LocalizedString) : {};

  const descIsBinding = Boolean(descValue && isBindingExpr(descValue));
  const descMode = descIsBinding ? "binding" : "literal";
  const descBinding = descIsBinding ? (descValue as DesignBindingExprV1) : null;
  const descLocalized = descValue && !descIsBinding ? (descValue as LocalizedString) : {};

  const dataSources = props.node.dataSources ?? {};

  return (
    <Space direction="vertical" size={12} className="w-full">
      <Typography.Text strong>{t("editor:EDITOR_PAGE_NODE_TITLE")}</Typography.Text>

      <div className="rounded-md border border-border p-3">
        <Typography.Text strong>{t("editor:EDITOR_PAGE_NODE_SEO")}</Typography.Text>

        <div className="mt-3">
          <div className="flex items-center justify-between gap-3">
            <Typography.Text type="secondary">
              {t("editor:EDITOR_PAGE_NODE_SEO_TITLE")}
            </Typography.Text>
            <Select
              size="small"
              value={titleMode}
              options={[
                { value: "literal", label: t("editor:EDITOR_FIELD_VALUE_MODE_LITERAL") },
                { value: "binding", label: t("editor:EDITOR_FIELD_VALUE_MODE_BINDING") },
              ]}
              onChange={(v) => {
                if (v === "binding") {
                  props.onChange({
                    seo: {
                      ...seo,
                      title: defaultBindingExprForField({ kind: "text", key: "title" }),
                    },
                  });
                } else {
                  props.onChange({ seo: { ...seo, title: {} } });
                }
              }}
              style={{ minWidth: 120 }}
            />
          </div>
          <div className="mt-2">
            {titleMode === "binding" && titleBinding ? (
              <DesignBindingExprField
                value={titleBinding}
                allowedSources={["primaryEntry", "routeParams", "site", "viewer"]}
                hint={t("editor:EDITOR_BINDING_PREVIEW_HINT")}
                workspaceId={props.workspaceId}
                primaryEntryTypeHint={props.primaryEntryTypeHint}
                defaultLocale={props.defaultLocale}
                onChange={(next) => props.onChange({ seo: { ...seo, title: next } })}
              />
            ) : (
              <LocalizedStringField
                supportedLocales={props.supportedLocales}
                defaultLocale={props.defaultLocale}
                value={titleLocalized}
                onChange={(next) => props.onChange({ seo: { ...seo, title: next } })}
                placeholder={t("editor:EDITOR_PAGE_NODE_SEO_TITLE_PLACEHOLDER")}
              />
            )}
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <Typography.Text type="secondary">
              {t("editor:EDITOR_PAGE_NODE_SEO_DESCRIPTION")}
            </Typography.Text>
            <Select
              size="small"
              value={descMode}
              options={[
                { value: "literal", label: t("editor:EDITOR_FIELD_VALUE_MODE_LITERAL") },
                { value: "binding", label: t("editor:EDITOR_FIELD_VALUE_MODE_BINDING") },
              ]}
              onChange={(v) => {
                if (v === "binding") {
                  props.onChange({
                    seo: {
                      ...seo,
                      description: defaultBindingExprForField({ kind: "text", key: "description" }),
                    },
                  });
                } else {
                  props.onChange({ seo: { ...seo, description: {} } });
                }
              }}
              style={{ minWidth: 120 }}
            />
          </div>
          <div className="mt-2">
            {descMode === "binding" && descBinding ? (
              <DesignBindingExprField
                value={descBinding}
                allowedSources={["primaryEntry", "routeParams", "site", "viewer"]}
                hint={t("editor:EDITOR_BINDING_PREVIEW_HINT")}
                workspaceId={props.workspaceId}
                primaryEntryTypeHint={props.primaryEntryTypeHint}
                defaultLocale={props.defaultLocale}
                onChange={(next) => props.onChange({ seo: { ...seo, description: next } })}
              />
            ) : (
              <LocalizedStringField
                supportedLocales={props.supportedLocales}
                defaultLocale={props.defaultLocale}
                value={descLocalized}
                onChange={(next) => props.onChange({ seo: { ...seo, description: next } })}
                multiline
                placeholder={t("editor:EDITOR_PAGE_NODE_SEO_DESCRIPTION_PLACEHOLDER")}
              />
            )}
          </div>
        </div>
      </div>

      <div className="rounded-md border border-border p-3">
        <Typography.Text strong>{t("editor:EDITOR_PAGE_NODE_DATA_SOURCES")}</Typography.Text>
        <div className="mt-3">
          <Typography.Text type="secondary">
            {t("editor:EDITOR_PAGE_NODE_PRIMARY_ENTRY_ID")}
          </Typography.Text>
          <Input
            className="mt-2"
            value={dataSources.primaryEntryId ?? ""}
            onChange={(e) =>
              props.onChange({
                dataSources: { ...dataSources, primaryEntryId: e.target.value.trim() },
              })
            }
            placeholder={t("editor:EDITOR_PAGE_NODE_PRIMARY_ENTRY_ID_PLACEHOLDER")}
            allowClear
          />
        </div>
        <div className="mt-3">
          <Typography.Text type="secondary">
            {t("editor:EDITOR_PAGE_NODE_PRIMARY_ENTRY_TYPE")}
          </Typography.Text>
          <Input
            className="mt-2"
            value={dataSources.primaryEntryTypeHint ?? ""}
            onChange={(e) =>
              props.onChange({
                dataSources: { ...dataSources, primaryEntryTypeHint: e.target.value.trim() },
              })
            }
            placeholder={t("editor:EDITOR_PAGE_NODE_PRIMARY_ENTRY_TYPE_PLACEHOLDER")}
            allowClear
          />
        </div>
      </div>
    </Space>
  );
}

function PrefabInstanceStyleInspector(props: {
  node: DesignPrefabInstanceNodeV1;
  styleOverrideWhitelist: string[];
  onChangeStyle: (next: DesignNodeV1["style"] | undefined) => void;
}) {
  const { t } = useTranslation(["editor"]);
  const allow = useMemo(
    () => new Set(props.styleOverrideWhitelist ?? []),
    [props.styleOverrideWhitelist],
  );

  if (allow.size === 0) return null;

  const style = props.node.style ?? {};

  const setStyle = (patch: Partial<NonNullable<DesignNodeV1["style"]>>) => {
    props.onChangeStyle({ ...style, ...patch });
  };

  const unsetKey = (key: keyof NonNullable<DesignNodeV1["style"]>) => {
    const next: any = { ...style };
    delete next[key];
    props.onChangeStyle(Object.keys(next).length ? next : undefined);
  };

  return (
    <Space direction="vertical" size={10} className="w-full">
      <Typography.Text strong>{t("editor:EDITOR_NODE_FIELD_STYLE")}</Typography.Text>

      {allow.has("backgroundColor") ? (
        <div>
          <Typography.Text type="secondary">
            {t("editor:EDITOR_STYLE_BACKGROUND_COLOR")}
          </Typography.Text>
          <div className="mt-2 flex items-center gap-2">
            <Input
              value={typeof style.backgroundColor === "string" ? style.backgroundColor : ""}
              onChange={(e) => setStyle({ backgroundColor: e.target.value })}
              placeholder="rgba(0,0,0,0.0)"
              allowClear
            />
            <Button size="small" onClick={() => unsetKey("backgroundColor")}>
              {t("editor:EDITOR_FIELD_CLEAR")}
            </Button>
          </div>
        </div>
      ) : null}

      {allow.has("borderColor") ? (
        <div>
          <Typography.Text type="secondary">
            {t("editor:EDITOR_STYLE_BORDER_COLOR")}
          </Typography.Text>
          <div className="mt-2 flex items-center gap-2">
            <Input
              value={typeof style.borderColor === "string" ? style.borderColor : ""}
              onChange={(e) => setStyle({ borderColor: e.target.value })}
              placeholder="rgba(0,0,0,0.12)"
              allowClear
            />
            <Button size="small" onClick={() => unsetKey("borderColor")}>
              {t("editor:EDITOR_FIELD_CLEAR")}
            </Button>
          </div>
        </div>
      ) : null}

      {allow.has("borderRadius") ? (
        <div>
          <Typography.Text type="secondary">
            {t("editor:EDITOR_STYLE_BORDER_RADIUS")}
          </Typography.Text>
          <div className="mt-2 flex items-center gap-2">
            <Input
              value={style.borderRadius == null ? "" : String(style.borderRadius)}
              onChange={(e) => setStyle({ borderRadius: e.target.value })}
              placeholder="12px"
              allowClear
            />
            <Button size="small" onClick={() => unsetKey("borderRadius")}>
              {t("editor:EDITOR_FIELD_CLEAR")}
            </Button>
          </div>
        </div>
      ) : null}

      {allow.has("boxShadow") ? (
        <div>
          <Typography.Text type="secondary">{t("editor:EDITOR_STYLE_BOX_SHADOW")}</Typography.Text>
          <div className="mt-2 flex items-center gap-2">
            <Input
              value={typeof style.boxShadow === "string" ? style.boxShadow : ""}
              onChange={(e) => setStyle({ boxShadow: e.target.value })}
              placeholder="0 1px 2px rgba(0,0,0,0.06)"
              allowClear
            />
            <Button size="small" onClick={() => unsetKey("boxShadow")}>
              {t("editor:EDITOR_FIELD_CLEAR")}
            </Button>
          </div>
        </div>
      ) : null}

      {allow.has("opacity") ? (
        <div>
          <Typography.Text type="secondary">{t("editor:EDITOR_STYLE_OPACITY")}</Typography.Text>
          <div className="mt-2 flex items-center gap-2">
            <InputNumber
              className="w-full"
              min={0}
              max={1}
              step={0.05}
              value={
                typeof style.opacity === "number" && Number.isFinite(style.opacity)
                  ? style.opacity
                  : null
              }
              onChange={(v) => {
                if (typeof v !== "number" || !Number.isFinite(v)) {
                  unsetKey("opacity");
                  return;
                }
                setStyle({ opacity: Math.max(0, Math.min(1, v)) });
              }}
            />
            <Button size="small" onClick={() => unsetKey("opacity")}>
              {t("editor:EDITOR_FIELD_CLEAR")}
            </Button>
          </div>
        </div>
      ) : null}
    </Space>
  );
}

function TextNodeInspector(props: {
  node: DesignTextNodeV1;
  workspaceId: string;
  primaryEntryTypeHint: string | null;
  supportedLocales: string[];
  defaultLocale: string;
  onChange: (next: Partial<DesignTextNodeV1>) => void;
}) {
  const { t } = useTranslation(["editor"]);
  const textValue = props.node.text;

  const isBinding = isBindingExpr(textValue);
  const binding = isBinding ? (textValue as DesignBindingExprV1) : null;
  const localized = !isBinding ? (textValue as LocalizedString) : {};
  const mode = isBinding ? "binding" : "literal";

  return (
    <Space direction="vertical" size={10} className="w-full">
      <div className="flex items-center justify-between gap-3">
        <Typography.Text strong>{t("editor:EDITOR_NODE_FIELD_TEXT")}</Typography.Text>
        <Select
          size="small"
          value={mode}
          options={[
            { value: "literal", label: t("editor:EDITOR_FIELD_VALUE_MODE_LITERAL") },
            { value: "binding", label: t("editor:EDITOR_FIELD_VALUE_MODE_BINDING") },
          ]}
          onChange={(v) => {
            if (v === "binding") {
              props.onChange({ text: defaultBindingExprForField({ kind: "text", key: "text" }) });
            } else {
              props.onChange({ text: {} });
            }
          }}
          style={{ minWidth: 120 }}
        />
      </div>

      {mode === "binding" && binding ? (
        <DesignBindingExprField
          value={binding}
          allowedSources={["primaryEntry", "routeParams", "site", "viewer"]}
          hint={t("editor:EDITOR_BINDING_PREVIEW_HINT")}
          workspaceId={props.workspaceId}
          primaryEntryTypeHint={props.primaryEntryTypeHint}
          defaultLocale={props.defaultLocale}
          onChange={(next) => props.onChange({ text: next })}
        />
      ) : (
        <LocalizedStringField
          supportedLocales={props.supportedLocales}
          defaultLocale={props.defaultLocale}
          value={localized}
          onChange={(next) => props.onChange({ text: next })}
          multiline
          placeholder={t("editor:EDITOR_NODE_FIELD_TEXT_PLACEHOLDER")}
        />
      )}

      <div>
        <Typography.Text type="secondary">{t("editor:EDITOR_NODE_FIELD_TAG")}</Typography.Text>
        <Select
          className="mt-2 w-full"
          value={props.node.tag ?? "p"}
          options={[
            { value: "p", label: "p" },
            { value: "span", label: "span" },
            { value: "h1", label: "h1" },
            { value: "h2", label: "h2" },
            { value: "h3", label: "h3" },
          ]}
          onChange={(v) => props.onChange({ tag: (v as any) || "p" })}
        />
      </div>

      <div>
        <Typography.Text type="secondary">{t("editor:EDITOR_NODE_FIELD_ALIGN")}</Typography.Text>
        <Select
          className="mt-2 w-full"
          value={props.node.align ?? "left"}
          options={[
            { value: "left", label: t("editor:EDITOR_NODE_FIELD_ALIGN_LEFT") },
            { value: "center", label: t("editor:EDITOR_NODE_FIELD_ALIGN_CENTER") },
            { value: "right", label: t("editor:EDITOR_NODE_FIELD_ALIGN_RIGHT") },
          ]}
          onChange={(v) => props.onChange({ align: (v as any) || "left" })}
        />
      </div>
    </Space>
  );
}

function ImageNodeInspector(props: {
  node: DesignImageNodeV1;
  workspaceId: string;
  primaryEntryTypeHint: string | null;
  supportedLocales: string[];
  defaultLocale: string;
  onChange: (next: Partial<DesignImageNodeV1>) => void;
}) {
  const { t } = useTranslation(["editor"]);
  const srcValue = props.node.src;
  const altValue = props.node.alt;

  const srcIsBinding = isBindingExpr(srcValue);
  const srcMode = srcIsBinding ? "binding" : "literal";
  const srcBinding = srcIsBinding ? (srcValue as DesignBindingExprV1) : null;

  const altIsBinding = Boolean(altValue && isBindingExpr(altValue));
  const altMode = altIsBinding ? "binding" : "literal";
  const altBinding = altIsBinding ? (altValue as DesignBindingExprV1) : null;
  const altLocalized = altValue && !altIsBinding ? (altValue as LocalizedString) : {};

  return (
    <Space direction="vertical" size={10} className="w-full">
      <Typography.Text strong>{t("editor:EDITOR_NODE_FIELD_IMAGE")}</Typography.Text>

      <div>
        <div className="flex items-center justify-between gap-3">
          <Typography.Text type="secondary">{t("editor:EDITOR_NODE_FIELD_SRC")}</Typography.Text>
          <Select
            size="small"
            value={srcMode}
            options={[
              { value: "literal", label: t("editor:EDITOR_FIELD_VALUE_MODE_LITERAL") },
              { value: "binding", label: t("editor:EDITOR_FIELD_VALUE_MODE_BINDING") },
            ]}
            onChange={(v) => {
              if (v === "binding") {
                props.onChange({ src: defaultBindingExprForField({ kind: "url", key: "src" }) });
              } else {
                props.onChange({ src: "" });
              }
            }}
            style={{ minWidth: 120 }}
          />
        </div>

        {srcMode === "binding" && srcBinding ? (
          <div className="mt-2">
            <DesignBindingExprField
              value={srcBinding}
              allowedSources={["primaryEntry", "routeParams", "site", "viewer"]}
              hint={t("editor:EDITOR_BINDING_PREVIEW_HINT")}
              workspaceId={props.workspaceId}
              primaryEntryTypeHint={props.primaryEntryTypeHint}
              defaultLocale={props.defaultLocale}
              onChange={(next) => props.onChange({ src: next })}
            />
          </div>
        ) : (
          <Input
            className="mt-2"
            value={typeof srcValue === "string" ? srcValue : ""}
            placeholder={t("editor:EDITOR_NODE_FIELD_SRC_PLACEHOLDER")}
            onChange={(e) => props.onChange({ src: e.target.value })}
            allowClear
          />
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <Typography.Text type="secondary">{t("editor:EDITOR_NODE_FIELD_ALT")}</Typography.Text>
          <Select
            size="small"
            value={altMode}
            options={[
              { value: "literal", label: t("editor:EDITOR_FIELD_VALUE_MODE_LITERAL") },
              { value: "binding", label: t("editor:EDITOR_FIELD_VALUE_MODE_BINDING") },
            ]}
            onChange={(v) => {
              if (v === "binding") {
                props.onChange({ alt: defaultBindingExprForField({ kind: "text", key: "alt" }) });
              } else {
                props.onChange({ alt: {} });
              }
            }}
            style={{ minWidth: 120 }}
          />
        </div>

        {altMode === "binding" && altBinding ? (
          <div className="mt-2">
            <DesignBindingExprField
              value={altBinding}
              allowedSources={["primaryEntry", "routeParams", "site", "viewer"]}
              hint={t("editor:EDITOR_BINDING_PREVIEW_HINT")}
              workspaceId={props.workspaceId}
              primaryEntryTypeHint={props.primaryEntryTypeHint}
              defaultLocale={props.defaultLocale}
              onChange={(next) => props.onChange({ alt: next })}
            />
          </div>
        ) : (
          <div className="mt-2">
            <LocalizedStringField
              supportedLocales={props.supportedLocales}
              defaultLocale={props.defaultLocale}
              value={altLocalized}
              onChange={(next) => props.onChange({ alt: next })}
              placeholder={t("editor:EDITOR_NODE_FIELD_ALT_PLACEHOLDER")}
            />
          </div>
        )}
      </div>

      <div>
        <Typography.Text type="secondary">
          {t("editor:EDITOR_NODE_FIELD_OBJECT_FIT")}
        </Typography.Text>
        <Select
          className="mt-2 w-full"
          value={props.node.objectFit ?? "cover"}
          options={[
            { value: "cover", label: "cover" },
            { value: "contain", label: "contain" },
            { value: "fill", label: "fill" },
            { value: "none", label: "none" },
          ]}
          onChange={(v) => props.onChange({ objectFit: (v as any) || "cover" })}
        />
      </div>
    </Space>
  );
}

function PrefabInstanceInspector(props: {
  node: Extract<DesignNodeV1, { type: "prefab_instance" }>;
  workspaceId: string;
  primaryEntryTypeHint: string | null;
  supportedLocales: string[];
  defaultLocale: string;
  manifestFields: FieldDefinition[];
  labelForField: (field: FieldDefinition) => string;
  onChangeProps: (next: Record<string, DesignValueV1>) => void;
}) {
  const { t } = useTranslation(["editor"]);
  const fields = props.manifestFields ?? [];

  const getProp = (key: string): DesignValueV1 | undefined => {
    const v = props.node.props?.[key];
    return v as DesignValueV1 | undefined;
  };

  const setPropValue = (key: string, next: DesignValueV1) => {
    const nextProps = { ...(props.node.props as Record<string, DesignValueV1> | undefined) };
    nextProps[key] = next;
    props.onChangeProps(nextProps);
  };

  const unsetProp = (key: string) => {
    const nextProps = { ...(props.node.props as Record<string, DesignValueV1> | undefined) };
    delete nextProps[key];
    props.onChangeProps(nextProps);
  };

  return (
    <Space direction="vertical" size={10} className="w-full">
      <Typography.Text strong>{t("editor:EDITOR_NODE_FIELD_PREFAB_PROPS")}</Typography.Text>
      <Typography.Text type="secondary" className="text-xs">
        {t("editor:EDITOR_NODE_FIELD_PREFAB_PROPS_HINT", { prefabId: props.node.prefabId })}
      </Typography.Text>

      {fields.length ? (
        <Space direction="vertical" size={14} className="w-full">
          {fields.map((field) => (
            <PrefabPropFieldEditor
              key={field.key}
              field={field}
              label={props.labelForField(field) || field.key}
              defaultLocale={props.defaultLocale}
              supportedLocales={props.supportedLocales}
              workspaceId={props.workspaceId}
              primaryEntryTypeHint={props.primaryEntryTypeHint}
              value={getProp(field.key)}
              onSetValue={(v) => setPropValue(field.key, v)}
              onUnset={() => unsetProp(field.key)}
            />
          ))}
        </Space>
      ) : (
        <Typography.Text type="secondary">
          {t("editor:EDITOR_NODE_FIELD_PREFAB_PROPS_EMPTY")}
        </Typography.Text>
      )}
    </Space>
  );
}

function ContentRefNodeInspector(props: {
  node: DesignContentRefNodeV1;
  workspaceId: string;
  primaryEntryTypeHint: string | null;
  supportedLocales: string[];
  defaultLocale: string;
  onChange: (next: Partial<DesignContentRefNodeV1>) => void;
}) {
  const { t } = useTranslation(["editor"]);
  const [newKey, setNewKey] = useState("");
  const [newKeyError, setNewKeyError] = useState<string | null>(null);

  const propKeys = useMemo(() => Object.keys(props.node.props ?? {}).sort(), [props.node.props]);

  const setPropValue = (key: string, next: DesignValueV1) => {
    const nextProps = { ...(props.node.props as Record<string, DesignValueV1> | undefined) };
    nextProps[key] = next;
    props.onChange({ props: nextProps });
  };

  const unsetProp = (key: string) => {
    const nextProps = { ...(props.node.props as Record<string, DesignValueV1> | undefined) };
    delete nextProps[key];
    props.onChange({ props: Object.keys(nextProps).length ? nextProps : undefined });
  };

  const addProp = () => {
    const k = newKey.trim();
    if (!k) {
      setNewKeyError("KEY_REQUIRED");
      return;
    }
    if (k in (props.node.props ?? {})) {
      setNewKeyError("KEY_DUPLICATE");
      return;
    }
    setNewKey("");
    setNewKeyError(null);
    setPropValue(k, { kind: "literal", value: null });
  };

  return (
    <Space direction="vertical" size={12} className="w-full">
      <Typography.Text strong>{t("editor:EDITOR_NODE_FIELD_CONTENT_REF")}</Typography.Text>

      <div>
        <Typography.Text type="secondary">
          {t("editor:EDITOR_NODE_FIELD_CONTENT_REF_ENTRY")}
        </Typography.Text>
        <Input
          className="mt-2"
          value={props.node.refEntryId}
          onChange={(e) => props.onChange({ refEntryId: e.target.value.trim() })}
          placeholder={t("editor:EDITOR_NODE_FIELD_CONTENT_REF_ENTRY_PLACEHOLDER")}
          allowClear
        />
      </div>

      <div>
        <Typography.Text type="secondary">
          {t("editor:EDITOR_NODE_FIELD_CONTENT_REF_STATE")}
        </Typography.Text>
        <Select
          className="mt-2 w-full"
          value={props.node.refState}
          options={[
            { value: "auto", label: "auto" },
            { value: "draft", label: "draft" },
            { value: "published", label: "published" },
          ]}
          onChange={(v) =>
            props.onChange({
              refState: v === "draft" || v === "published" || v === "auto" ? v : "auto",
            })
          }
        />
      </div>

      <div>
        <Typography.Text type="secondary">
          {t("editor:EDITOR_NODE_FIELD_CONTENT_REF_PROPS")}
        </Typography.Text>

        <Space direction="vertical" size={10} className="mt-2 w-full">
          {propKeys.length ? (
            propKeys.map((k) => (
              <ContentRefPropValueEditor
                key={k}
                propKey={k}
                value={(props.node.props ?? {})[k]}
                workspaceId={props.workspaceId}
                primaryEntryTypeHint={props.primaryEntryTypeHint}
                supportedLocales={props.supportedLocales}
                defaultLocale={props.defaultLocale}
                onSetValue={(v) => setPropValue(k, v)}
                onUnset={() => unsetProp(k)}
              />
            ))
          ) : (
            <Typography.Text type="secondary" className="text-xs">
              {t("editor:EDITOR_NODE_FIELD_CONTENT_REF_PROPS_EMPTY")}
            </Typography.Text>
          )}

          <div className="rounded-md border border-border p-3">
            <Typography.Text type="secondary" className="text-xs">
              {t("editor:EDITOR_NODE_FIELD_CONTENT_REF_PROPS_ADD")}
            </Typography.Text>
            <div className="mt-2 flex items-center gap-2">
              <Input
                value={newKey}
                onChange={(e) => {
                  setNewKey(e.target.value);
                  setNewKeyError(null);
                }}
                placeholder={t("editor:EDITOR_NODE_FIELD_CONTENT_REF_PROPS_KEY_PLACEHOLDER")}
                onPressEnter={addProp}
              />
              <Button onClick={addProp}>
                {t("editor:EDITOR_NODE_FIELD_CONTENT_REF_PROPS_ADD_OK")}
              </Button>
            </div>
            {newKeyError ? (
              <Typography.Text type="danger" className="mt-1 block text-xs">
                {newKeyError === "KEY_REQUIRED"
                  ? t("editor:EDITOR_NODE_FIELD_CONTENT_REF_PROPS_KEY_REQUIRED")
                  : t("editor:EDITOR_NODE_FIELD_CONTENT_REF_PROPS_KEY_DUPLICATE")}
              </Typography.Text>
            ) : null}
          </div>
        </Space>
      </div>
    </Space>
  );
}

function ContentRefPropValueEditor(props: {
  propKey: string;
  value: DesignValueV1 | undefined;
  workspaceId: string;
  primaryEntryTypeHint: string | null;
  supportedLocales: string[];
  defaultLocale: string;
  onSetValue: (value: DesignValueV1) => void;
  onUnset: () => void;
}) {
  const { t } = useTranslation(["editor"]);

  const raw = props.value;
  const isBinding = Boolean(raw && isBindingExpr(raw));
  const literal = raw && raw.kind === "literal" ? raw.value : undefined;
  const binding = isBinding ? (raw as DesignBindingExprV1) : null;
  const mode = isBinding ? "binding" : "literal";

  const header = (
    <div className="flex items-center justify-between gap-3">
      <Typography.Text type="secondary" className="font-mono">
        {props.propKey}
      </Typography.Text>
      <Space size={6}>
        <Select
          size="small"
          value={mode}
          options={[
            { value: "literal", label: t("editor:EDITOR_FIELD_VALUE_MODE_LITERAL") },
            { value: "binding", label: t("editor:EDITOR_FIELD_VALUE_MODE_BINDING") },
          ]}
          onChange={(v) => {
            if (v === "binding") {
              const d = defaultBindingExprForField({ kind: "text", key: props.propKey });
              props.onSetValue({ kind: "binding", source: d.source, path: d.path });
              return;
            }
            props.onSetValue({ kind: "literal", value: null });
          }}
          style={{ minWidth: 110 }}
        />
        <Button size="small" type="text" danger onClick={props.onUnset}>
          {t("editor:EDITOR_FIELD_CLEAR")}
        </Button>
      </Space>
    </div>
  );

  if (mode === "binding" && binding) {
    return (
      <div>
        {header}
        <div className="mt-2">
          <DesignBindingExprField
            value={binding}
            allowedSources={["primaryEntry", "routeParams", "site", "viewer"]}
            hint={t("editor:EDITOR_BINDING_PREVIEW_HINT")}
            workspaceId={props.workspaceId}
            primaryEntryTypeHint={props.primaryEntryTypeHint}
            defaultLocale={props.defaultLocale}
            onChange={(next) => props.onSetValue(next)}
          />
        </div>
      </div>
    );
  }

  const localized = coerceTextLiteralToLocalizedString(literal, props.defaultLocale);
  const hasLocalized = isRecord(literal) && isStringRecord(literal as Record<string, unknown>);

  if (typeof literal === "string" || hasLocalized) {
    return (
      <div>
        {header}
        <div className="mt-2">
          <LocalizedStringField
            supportedLocales={props.supportedLocales}
            defaultLocale={props.defaultLocale}
            value={localized}
            onChange={(next) => {
              const map = localizedStringToJsonObject(next);
              if (Object.keys(map).length === 0) {
                props.onSetValue({ kind: "literal", value: null });
                return;
              }
              props.onSetValue({ kind: "literal", value: map });
            }}
            placeholder={t("editor:EDITOR_NODE_FIELD_CONTENT_REF_PROPS_VALUE_PLACEHOLDER")}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      {header}
      <div className="mt-2">
        <JsonValueEditor
          value={literal}
          placeholder={t("editor:EDITOR_NODE_FIELD_CONTENT_REF_PROPS_VALUE_PLACEHOLDER")}
          onChange={(next) => props.onSetValue({ kind: "literal", value: next })}
        />
      </div>
    </div>
  );
}

export function PrefabPropFieldEditor(props: {
  field: FieldDefinition;
  label: string;
  defaultLocale: string;
  supportedLocales: string[];
  workspaceId: string;
  primaryEntryTypeHint: string | null;
  value: DesignValueV1 | undefined;
  onSetValue: (value: DesignValueV1) => void;
  onUnset: () => void;
}) {
  const { t, i18n } = useTranslation(["editor"]);
  const field = props.field;
  const raw = props.value;
  const isBinding = Boolean(raw && isBindingExpr(raw));
  const literal = raw && raw.kind === "literal" ? raw.value : undefined;
  const binding = isBinding ? (raw as DesignBindingExprV1) : null;
  const mode = isBinding ? "binding" : "literal";

  const resolveLocalizedLabel = (value: LocalizedString | undefined): string => {
    if (!value) return "";
    const loc = (i18n.language || "").trim() || "en-US";
    return (
      value[loc] || value[props.defaultLocale] || value["en-US"] || Object.values(value)[0] || ""
    );
  };

  const placeholder = resolveLocalizedLabel(field.ui?.placeholder) || props.label;

  const canClear = !field.required && !isBinding;

  const header = (
    <div className="flex items-center justify-between gap-3">
      <Typography.Text type="secondary">{props.label}</Typography.Text>
      <Space size={6}>
        <Select
          size="small"
          value={mode}
          options={[
            { value: "literal", label: t("editor:EDITOR_FIELD_VALUE_MODE_LITERAL") },
            { value: "binding", label: t("editor:EDITOR_FIELD_VALUE_MODE_BINDING") },
          ]}
          onChange={(v) => {
            if (v === "binding") {
              const d = defaultBindingExprForField({ kind: field.kind, key: field.key });
              // Avoid prefabProps as a source for prefab instance props (it usually won't resolve and can be confusing).
              const allowedSources: DesignBindingSourceV1[] = [
                "primaryEntry",
                "routeParams",
                "site",
                "viewer",
              ];
              const source = allowedSources.includes(d.source) ? d.source : "primaryEntry";
              props.onSetValue({ kind: "binding", source, path: d.path });
            } else {
              props.onSetValue({ kind: "literal", value: null });
            }
          }}
          style={{ minWidth: 110 }}
        />
        <Button size="small" type="text" danger disabled={!canClear} onClick={props.onUnset}>
          {t("editor:EDITOR_FIELD_CLEAR")}
        </Button>
      </Space>
    </div>
  );

  if (mode === "binding" && binding) {
    return (
      <div>
        {header}
        <div className="mt-2">
          <DesignBindingExprField
            value={binding}
            allowedSources={["primaryEntry", "routeParams", "site", "viewer"]}
            hint={t("editor:EDITOR_BINDING_PREVIEW_HINT")}
            workspaceId={props.workspaceId}
            primaryEntryTypeHint={props.primaryEntryTypeHint}
            defaultLocale={props.defaultLocale}
            onChange={(next) => props.onSetValue(next)}
          />
        </div>
      </div>
    );
  }

  if (field.kind === "text" || field.kind === "richtext") {
    const localized = coerceTextLiteralToLocalizedString(literal, props.defaultLocale);
    return (
      <div>
        {header}
        <div className="mt-2">
          <LocalizedStringField
            supportedLocales={props.supportedLocales}
            defaultLocale={props.defaultLocale}
            value={localized}
            onChange={(next) => {
              const map = localizedStringToJsonObject(next);
              if (Object.keys(map).length === 0) {
                props.onSetValue({ kind: "literal", value: null });
                return;
              }
              props.onSetValue({ kind: "literal", value: map });
            }}
            multiline={field.kind === "richtext" || field.key === "description"}
            placeholder={placeholder}
          />
        </div>
      </div>
    );
  }

  if (field.kind === "url" || field.kind === "media" || field.kind === "reference") {
    const value = typeof literal === "string" ? literal : "";
    return (
      <div>
        {header}
        <Input
          className="mt-2"
          value={value}
          placeholder={placeholder}
          onChange={(e) => props.onSetValue({ kind: "literal", value: String(e.target.value) })}
          allowClear
        />
      </div>
    );
  }

  if (field.kind === "number") {
    const value = typeof literal === "number" && Number.isFinite(literal) ? literal : null;
    return (
      <div>
        {header}
        <InputNumber
          className="mt-2 w-full"
          value={value}
          placeholder={placeholder}
          onChange={(v) => {
            if (typeof v !== "number" || !Number.isFinite(v)) {
              props.onUnset();
              return;
            }
            props.onSetValue({ kind: "literal", value: v });
          }}
        />
      </div>
    );
  }

  if (field.kind === "boolean") {
    const checked = typeof literal === "boolean" ? literal : false;
    return (
      <div>
        {header}
        <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
          <Typography.Text type="secondary">{placeholder}</Typography.Text>
          <Switch
            checked={checked}
            onChange={(v) => props.onSetValue({ kind: "literal", value: Boolean(v) })}
          />
        </div>
      </div>
    );
  }

  if (field.kind === "select") {
    const options =
      field.validation?.options?.map((opt) => ({
        value: opt.value,
        label: resolveLocalizedLabel(opt.label) || opt.value,
      })) ?? [];
    const value = typeof literal === "string" ? literal : undefined;

    return (
      <div>
        {header}
        <Select
          className="mt-2 w-full"
          value={value}
          placeholder={placeholder}
          options={options}
          onChange={(v) => {
            if (v == null || String(v).trim() === "") {
              props.onUnset();
              return;
            }
            props.onSetValue({ kind: "literal", value: String(v) });
          }}
          allowClear
        />
      </div>
    );
  }

  if (field.kind === "date" || field.kind === "color") {
    const value = typeof literal === "string" ? literal : "";
    return (
      <div>
        {header}
        <Input
          className="mt-2"
          value={value}
          placeholder={placeholder}
          onChange={(e) => props.onSetValue({ kind: "literal", value: String(e.target.value) })}
          allowClear
        />
      </div>
    );
  }

  if (field.kind === "json" || field.kind === "object" || field.kind === "array") {
    return (
      <div>
        {header}
        <div className="mt-2">
          <JsonValueEditor
            value={literal}
            placeholder={placeholder}
            onChange={(next) => props.onSetValue({ kind: "literal", value: next })}
          />
        </div>
      </div>
    );
  }

  return null;
}

function JsonValueEditor(props: {
  value: JsonValue | undefined;
  placeholder: string;
  onChange: (next: JsonValue) => void;
}) {
  const { t } = useTranslation(["editor"]);
  const [draft, setDraft] = useState<string>(() => stringifyJsonValue(props.value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(stringifyJsonValue(props.value));
    setError(null);
  }, [props.value]);

  const applyIfValid = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      props.onChange(null);
      setError(null);
      return;
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!isJsonValue(parsed)) {
        setError(t("editor:EDITOR_FIELD_JSON_INVALID"));
        return;
      }
      props.onChange(parsed);
      setError(null);
    } catch {
      setError(t("editor:EDITOR_FIELD_JSON_INVALID"));
    }
  };

  return (
    <div>
      <Input.TextArea
        value={draft}
        placeholder={props.placeholder}
        autoSize={{ minRows: 4, maxRows: 10 }}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          applyIfValid(next);
        }}
      />
      {error ? (
        <Typography.Text type="danger" className="mt-1 block text-xs">
          {error}
        </Typography.Text>
      ) : null}
    </div>
  );
}

function stringifyJsonValue(value: JsonValue | undefined): string {
  if (value === undefined) return "";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2) ?? "";
  } catch {
    return "";
  }
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (isRecord(value)) {
    for (const v of Object.values(value)) {
      if (!isJsonValue(v)) return false;
    }
    return true;
  }
  return false;
}

function localizedStringToJsonObject(value: LocalizedString): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value || {})) {
    const key = String(k || "").trim();
    const val = typeof v === "string" ? v.trim() : "";
    if (!key || !val) continue;
    out[key] = val;
  }
  return out;
}

function coerceTextLiteralToLocalizedString(
  literal: JsonValue | undefined,
  defaultLocale: string,
): LocalizedString {
  if (typeof literal === "string") {
    const s = literal.trim();
    return s ? { [defaultLocale]: s } : {};
  }
  if (isRecord(literal) && isStringRecord(literal)) return literal as unknown as LocalizedString;
  if (isRecord(literal)) return {};
  if (literal == null) return {};
  const s = String(literal).trim();
  return s ? { [defaultLocale]: s } : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringRecord(value: Record<string, unknown>): boolean {
  const entries = Object.entries(value);
  if (!entries.length) return false;
  const localeLike = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
  for (const [, v] of entries) {
    if (typeof v !== "string") return false;
  }
  // Avoid treating arbitrary objects like { name: 'xx' } as LocalizedString.
  for (const [k] of entries) {
    const key = String(k || "").trim();
    if (!localeLike.test(key)) return false;
  }
  return true;
}

function isBindingExpr(value: unknown): value is DesignBindingExprV1 {
  if (!isRecord(value)) return false;
  return (
    value.kind === "binding" && typeof value.source === "string" && typeof value.path === "string"
  );
}

function defaultBindingExprForField(args: { kind: string; key: string }): DesignBindingExprV1 {
  const key = String(args.key || "").trim() || "value";
  if (args.kind === "url" || args.kind === "media") {
    return { kind: "binding", source: "primaryEntry", path: `fields.${key}` };
  }
  if (args.kind === "reference") {
    return { kind: "binding", source: "primaryEntry", path: `fields.${key}._ref` };
  }
  if (args.kind === "boolean") {
    return { kind: "binding", source: "primaryEntry", path: `fields.${key}` };
  }
  if (args.kind === "number") {
    return { kind: "binding", source: "primaryEntry", path: `fields.${key}` };
  }
  if (args.kind === "select") {
    return { kind: "binding", source: "primaryEntry", path: `fields.${key}` };
  }
  if (args.kind === "date") {
    return { kind: "binding", source: "primaryEntry", path: `fields.${key}` };
  }
  if (args.kind === "color") {
    return { kind: "binding", source: "primaryEntry", path: `fields.${key}` };
  }
  if (args.kind === "json" || args.kind === "object" || args.kind === "array") {
    return { kind: "binding", source: "primaryEntry", path: `fields.${key}` };
  }
  // text/richtext/default
  return { kind: "binding", source: "primaryEntry", path: `fields.${key}` };
}
