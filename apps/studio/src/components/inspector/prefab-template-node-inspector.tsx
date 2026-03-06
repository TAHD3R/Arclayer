import type {
  DesignBindingExprV1,
  DesignNodeV1,
  DesignValueV1,
  FieldDefinition,
  PageBlueprint,
} from "@celestial/block-protocol";
import { Alert, Space, Typography } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { PrefabRegistryV1 } from "@celestial/renderer";

import { PrefabPropFieldEditor } from "@/components/inspector/node-inspector-drawer";
import { clonePageBlueprint } from "@/lib/page-blueprint";

function isBindingExpr(value: unknown): value is DesignBindingExprV1 {
  return Boolean(value && typeof value === "object" && (value as any).kind === "binding");
}

function extractPrefabPropKeysFromTemplateNode(node: DesignNodeV1): string[] {
  const keys = new Set<string>();

  const addPath = (path: string | undefined) => {
    const raw = (path || "").trim();
    if (!raw) return;
    const first =
      raw
        .split(".")
        .map((s) => s.trim())
        .find((s) => Boolean(s)) ?? "";
    if (!first) return;
    keys.add(first);
  };

  if (node.type === "text") {
    if (isBindingExpr(node.text) && node.text.source === "prefabProps") addPath(node.text.path);
  }

  if (node.type === "image") {
    if (isBindingExpr(node.src) && node.src.source === "prefabProps") addPath(node.src.path);
    if (node.alt && isBindingExpr(node.alt) && node.alt.source === "prefabProps")
      addPath(node.alt.path);
  }

  if (node.type === "embed") {
    if (isBindingExpr(node.url) && node.url.source === "prefabProps") addPath(node.url.path);
  }

  return [...keys];
}

function resolveField(args: { manifestFields: FieldDefinition[]; key: string }): FieldDefinition {
  const found = args.manifestFields.find((f) => f.key === args.key);
  if (found) return found;
  return {
    key: args.key,
    kind: "text",
    label: { "zh-CN": args.key, "en-US": args.key },
  } as FieldDefinition;
}

export function PrefabTemplateNodeInspectorPanel(props: {
  workspaceId: string;
  doc: PageBlueprint;
  instanceId: string;
  templateNodeId: string;
  prefabRegistry: PrefabRegistryV1;
  supportedLocales: string[];
  defaultLocale: string;
  primaryEntryTypeHint: string | null;
  onChangeDoc: (next: PageBlueprint) => void;
}) {
  const { t } = useTranslation(["editor"]);

  const instance = props.doc.nodesById[props.instanceId];
  const instanceOk = instance && instance.type === "prefab_instance";
  const def = useMemo(
    () => (instanceOk ? props.prefabRegistry.get((instance as any).prefabId) : null),
    [instanceOk, instance, props.prefabRegistry],
  );

  if (!instanceOk) {
    return (
      <div className="p-4">
        <Alert type="error" showIcon message={t("editor:EDITOR_PREFAB_TPL_INVALID_INSTANCE")} />
      </div>
    );
  }

  if (!def) {
    return (
      <div className="p-4">
        <Alert type="error" showIcon message={t("editor:EDITOR_PREFAB_TPL_UNKNOWN_PREFAB")} />
      </div>
    );
  }

  const tplNode = def.template.nodesById[props.templateNodeId];
  if (!tplNode) {
    return (
      <div className="p-4">
        <Alert type="error" showIcon message={t("editor:EDITOR_PREFAB_TPL_UNKNOWN_NODE")} />
      </div>
    );
  }

  const boundKeys = extractPrefabPropKeysFromTemplateNode(tplNode);
  const manifestFields = def.manifest.attributes ?? [];

  const setPropValue = (key: string, nextValue: DesignValueV1) => {
    const next = clonePageBlueprint(props.doc);
    const inst = next.nodesById[props.instanceId];
    if (!inst || inst.type !== "prefab_instance") return;
    inst.props = { ...inst.props, [key]: nextValue };
    props.onChangeDoc(next);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-card px-4 py-3">
        <Typography.Text strong>
          {t("editor:EDITOR_PREFAB_TPL_TITLE", {
            prefabId: def.prefabId,
            nodeId: props.templateNodeId,
          })}
        </Typography.Text>
        <Typography.Text type="secondary" className="mt-1 block text-caption">
          {(tplNode as any).name ? String((tplNode as any).name) : tplNode.type}
        </Typography.Text>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {boundKeys.length ? (
          <Space direction="vertical" size={12} className="w-full">
            {boundKeys.map((key) => {
              const field = resolveField({ manifestFields, key });
              return (
                <PrefabPropFieldEditor
                  key={key}
                  field={field}
                  label={key}
                  defaultLocale={props.defaultLocale}
                  supportedLocales={props.supportedLocales}
                  workspaceId={props.workspaceId}
                  primaryEntryTypeHint={props.primaryEntryTypeHint}
                  value={(instance as { props: Record<string, DesignValueV1> }).props?.[key]}
                  onSetValue={(v) => setPropValue(key, v)}
                  onUnset={() => setPropValue(key, { kind: "literal", value: null })}
                />
              );
            })}
          </Space>
        ) : (
          <Alert
            type="info"
            showIcon
            message={t("editor:EDITOR_PREFAB_TPL_NO_BOUND_PROPS")}
            description={t("editor:EDITOR_PREFAB_TPL_NO_BOUND_PROPS_DESC")}
          />
        )}
      </div>
    </div>
  );
}
