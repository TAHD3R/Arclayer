import React from "react";
import type { ReactNode } from "react";

import type {
  PageBlueprint,
  DesignBindingExprV1,
  ContentRefIncludesMap,
  DesignNodeId,
  DesignNodeV1,
  DesignStyleV1,
  DesignTransformV1,
  LocalizedString,
  ViewerContext,
} from "@celestial/site-block-protocol";
import { resolveLocalizedValue } from "@celestial/site-block-protocol";

import { isPageBlueprint } from "../design-document";
import type { LayoutComputeViewport, LayoutNode } from "../layout/types";
import { computeLayoutBoxes } from "../layout/compute-layout";
import type { DesignRenderDataSourcesV1, PrefabRegistryV1 } from "./prefab-registry";
import {
  expandPrefabInstanceV1,
  filterStyleByWhitelist,
  resolveBindingToUnknown,
  resolvePrefabPropsToPlainValues,
  validatePrefabInstancePropsV1,
  validateSlotChildrenAgainstManifest,
} from "./prefab-registry";
import { createDefaultPrefabRegistryV1 } from "./default-prefab-registry";
import { resolveDesignNodeAtBreakpointV1 } from "./responsive-overrides";
import { resolveRefState } from "./resolve-ref-state";

export type PageBlueprintRendererViewport = {
  width: number;
  height: number;
  baseWidth?: number;
  baseHeight?: number;
};

export type PageBlueprintRendererProps = {
  document: PageBlueprint;
  ctx: ViewerContext;
  /**
   * SSR 首屏策略：
   * - 在 SSR 中传入稳定的 width（例如 1440），确保 SSR/CSR 首次渲染一致，避免水合 warning。
   * - 在 CSR 水合后可再用真实 window.innerWidth 触发二次布局校正（可选）。
   */
  viewport: PageBlueprintRendererViewport;
  /**
   * Prefab registry: prefabId -> renderer/schema/slots。
   * 未提供时会使用内置 registry（仅用于开发示例）。
   */
  prefabRegistry?: PrefabRegistryV1;
  /**
   * Binding 数据源（primary entry / route params / site / viewer）。
   * 这是阶段 1-3 的最小闭环：允许在 text/image/prefab props 中绑定。
   */
  dataSources?: DesignRenderDataSourcesV1;
  /** Flat includes map returned by backend route resolve. */
  includes?: ContentRefIncludesMap;
};

type ProcessLike = {
  env?: {
    NODE_ENV?: string;
  };
};

function isProductionEnv(): boolean {
  if (typeof globalThis === "undefined") return false;

  const processLike = (globalThis as typeof globalThis & { process?: unknown }).process;
  if (!processLike || typeof processLike !== "object") return false;

  const env = (processLike as ProcessLike).env;
  return env?.NODE_ENV === "production";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBindingExpr(value: unknown): value is DesignBindingExprV1 {
  if (!isRecord(value)) return false;
  return value.kind === "binding" && typeof value.source === "string" && typeof value.path === "string";
}

function resolveNodeAtBreakpoint(node: DesignNodeV1, ctx: ViewerContext): DesignNodeV1 {
  return resolveDesignNodeAtBreakpointV1({ node, breakpoint: ctx.breakpoint });
}

function resolveTextValue(value: LocalizedString, ctx: ViewerContext): string {
  return resolveLocalizedValue(value, ctx) ?? "";
}

function resolveValueToString(args: {
  value: string | LocalizedString | DesignBindingExprV1 | undefined;
  ctx: ViewerContext;
  dataSources: DesignRenderDataSourcesV1 | undefined;
}): string {
  const v = args.value;
  if (v === undefined) return "";
  if (typeof v === "string") return v;
  if (isBindingExpr(v)) {
    const out = resolveBindingToUnknown({ expr: v, data: args.dataSources });
    return typeof out === "string" ? out : out == null ? "" : String(out);
  }
  return resolveTextValue(v as LocalizedString, args.ctx);
}

function toCssLengthPx(value: number | undefined): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return `${value}px`;
}

function applyStyle(style: React.CSSProperties, design: DesignStyleV1 | undefined): void {
  if (!design) return;
  if (design.color) style.color = design.color;
  if (design.backgroundColor) style.backgroundColor = design.backgroundColor;
  if (design.borderColor) style.borderColor = design.borderColor;
  if (design.borderStyle) style.borderStyle = design.borderStyle;
  if (design.borderWidth !== undefined) style.borderWidth = design.borderWidth as any;
  if (design.borderRadius !== undefined) style.borderRadius = design.borderRadius as any;
  if (design.boxShadow) style.boxShadow = design.boxShadow;
  if (typeof design.opacity === "number" && Number.isFinite(design.opacity)) {
    style.opacity = Math.min(1, Math.max(0, design.opacity));
  }
}

function applyTransform(style: React.CSSProperties, transform: DesignTransformV1 | undefined): void {
  if (!transform) return;
  const parts: string[] = [];
  if (typeof transform.rotation === "number" && Number.isFinite(transform.rotation)) {
    parts.push(`rotate(${transform.rotation}deg)`);
  }
  if (typeof transform.scaleX === "number" && Number.isFinite(transform.scaleX)) {
    parts.push(`scaleX(${transform.scaleX})`);
  }
  if (typeof transform.scaleY === "number" && Number.isFinite(transform.scaleY)) {
    parts.push(`scaleY(${transform.scaleY})`);
  }
  if (parts.length) style.transform = parts.join(" ");
}

function computeContentHeight(boxesById: Record<string, { x: number; y: number; width: number; height: number }>): number {
  let max = 0;
  for (const box of Object.values(boxesById)) {
    max = Math.max(max, box.y + box.height);
  }
  return max;
}

function toLayoutNodes(args: {
  document: PageBlueprint;
  ctx: ViewerContext;
  dataSources: DesignRenderDataSourcesV1 | undefined;
}): Record<string, LayoutNode> {
  const out: Record<string, LayoutNode> = {};
  for (const [id, rawNode] of Object.entries(args.document.nodesById)) {
    const node = resolveNodeAtBreakpoint(rawNode, args.ctx);
    const anyNode = node as unknown as { children?: unknown };
    const children = Array.isArray(anyNode.children) ? (anyNode.children as string[]) : undefined;

    const layout = node.layout;
    const positioning = layout?.self?.rect
      ? Object.assign(
          {},
          { kind: "absolute" as const, rect: layout.self.rect },
          layout.self.constraints ? { constraints: layout.self.constraints } : {},
          layout.self.alignX ? { alignX: layout.self.alignX } : {},
          layout.self.alignY ? { alignY: layout.self.alignY } : {},
        )
      : undefined;

    const childrenLayout = layout?.children
      ? layout.children.mode === "auto"
        ? Object.assign(
            {},
            { mode: "auto" as const, direction: layout.children.direction },
            typeof layout.children.gap === "number" ? { gap: layout.children.gap } : {},
            typeof layout.children.padding === "number" ? { padding: layout.children.padding } : {},
            layout.children.alignItems ? { alignItems: layout.children.alignItems } : {},
            layout.children.justifyContent ? { justifyContent: layout.children.justifyContent } : {},
            layout.children.wrap ? { wrap: layout.children.wrap } : {},
          )
        : { mode: "absolute" as const }
      : { mode: "absolute" as const };

    out[id] = {
      id,
      type: node.type,
      positioning,
      childrenLayout,
      ...(children ? { children } : {}),
      ...(node.type === "text"
        ? {
            text: Object.assign(
              {},
              {
                content: resolveValueToString({
                  value: node.text,
                  ctx: args.ctx,
                  dataSources: args.dataSources,
                }),
              },
              typeof node.style?.typography?.fontSize === "number"
                ? { fontSize: node.style.typography.fontSize }
                : {},
              typeof node.style?.typography?.lineHeight === "number"
                ? { lineHeight: node.style.typography.lineHeight }
                : {},
              typeof layout?.self?.rect?.width === "number"
                ? { maxWidth: layout.self!.rect.width }
                : {},
            ),
          }
        : {}),
    };
  }
  return out;
}

function defaultPrefabRegistry(): PrefabRegistryV1 | undefined {
  // 约定：未显式传入 registry 时，使用内置 PrefabRegistry。
  // 目的：确保 PrefabInstance 在阶段 3 即可“开箱即用”渲染，而不是只能依赖 host 注入。
  return createDefaultPrefabRegistryV1();
}

export function PageBlueprintRenderer(props: PageBlueprintRendererProps) {
  const {
    document: inputDoc,
    ctx,
    viewport,
    prefabRegistry: prefabRegistryFromProps,
    dataSources,
    includes,
  } = props;

  const isValid = React.useMemo(() => isPageBlueprint(inputDoc), [inputDoc]);

  const prefabRegistry = React.useMemo(
    () => prefabRegistryFromProps ?? defaultPrefabRegistry(),
    [prefabRegistryFromProps],
  );

  if (!isValid) {
    return <RenderErrorPanel title="Invalid PageBlueprint" detail="Schema validation failed" />;
  }

  const layoutNodes = React.useMemo(
    () => toLayoutNodes({ document: inputDoc, ctx, dataSources }),
    [ctx, dataSources, inputDoc],
  );

  const viewportArgs: LayoutComputeViewport = React.useMemo(
    () =>
      Object.assign(
        {},
        { width: viewport.width, height: viewport.height },
        typeof viewport.baseWidth === "number" ? { baseWidth: viewport.baseWidth } : {},
        typeof viewport.baseHeight === "number" ? { baseHeight: viewport.baseHeight } : {},
      ),
    [viewport.baseHeight, viewport.baseWidth, viewport.height, viewport.width],
  );

  const layoutResult = React.useMemo(() => {
    try {
      return computeLayoutBoxes({ rootId: inputDoc.rootId, nodesById: layoutNodes, viewport: viewportArgs });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return { boxesById: {}, warnings: [{ nodeId: inputDoc.rootId, message: msg }] };
    }
  }, [inputDoc.rootId, layoutNodes, viewportArgs]);

  const contentHeight = React.useMemo(() => computeContentHeight(layoutResult.boxesById), [layoutResult.boxesById]);

  const rootStyle: React.CSSProperties = React.useMemo(
    () => ({
      position: "relative",
      width: "100%",
      minHeight: `${Math.max(viewport.height, contentHeight)}px`,
    }),
    [contentHeight, viewport.height],
  );

  const root = inputDoc.nodesById[inputDoc.rootId];
  if (!root || root.type !== "page_root") {
    return <RenderErrorPanel title="Invalid PageBlueprint" detail="Missing page_root root node" />;
  }

  if (layoutResult.warnings.length && !isProductionEnv()) {
    // 仅开发态提示，避免生产输出噪音。
    // eslint-disable-next-line no-console
    console.warn("[site-renderer-core] Layout warnings", layoutResult.warnings);
  }

  return (
    <main data-celestial="design-document" data-version={inputDoc.version} style={rootStyle}>
      {root.children.map((id) => (
        <React.Fragment key={id}>
          <NodeErrorBoundary nodeId={id}>
            <RenderNode
              nodeId={id}
              document={inputDoc}
              ctx={ctx}
              boxesById={layoutResult.boxesById}
              parentId={inputDoc.rootId}
              prefabRegistry={prefabRegistry}
              dataSources={dataSources}
              globalNodesById={inputDoc.nodesById}
              includes={includes}
            />
          </NodeErrorBoundary>
        </React.Fragment>
      ))}
    </main>
  );
}

function RenderNode(args: {
  nodeId: DesignNodeId;
  parentId: DesignNodeId;
  document: PageBlueprint;
  ctx: ViewerContext;
  boxesById: Record<string, { x: number; y: number; width: number; height: number }>;
  prefabRegistry: PrefabRegistryV1 | undefined;
  dataSources: DesignRenderDataSourcesV1 | undefined;
  globalNodesById: Record<DesignNodeId, DesignNodeV1>;
  includes: ContentRefIncludesMap | undefined;
}): ReactNode {
  const node = args.document.nodesById[args.nodeId];
  if (!node) return null;

  const resolved = resolveNodeAtBreakpoint(node, args.ctx);

  const box = args.boxesById[args.nodeId];
  const parentBox = args.boxesById[args.parentId];
  const relX = box && parentBox ? box.x - parentBox.x : 0;
  const relY = box && parentBox ? box.y - parentBox.y : 0;

  const style: React.CSSProperties = {
    position: "absolute",
    left: toCssLengthPx(relX),
    top: toCssLengthPx(relY),
    width: box ? toCssLengthPx(box.width) : undefined,
    height: box ? toCssLengthPx(box.height) : undefined,
    boxSizing: "border-box",
  };

  // PrefabInstance 的 style overrides 需要走 whitelist 过滤，因此不在这里直接 applyStyle。
  if (resolved.type !== "prefab_instance") {
    applyStyle(style, resolved.style);
  }
  applyTransform(style, resolved.transform);

  if (resolved.type === "page_root") return null;

  if (resolved.type === "frame" || resolved.type === "group") {
    const children = resolved.children ?? [];
    return (
      <div
        data-node-id={resolved.id}
        data-node-type={resolved.type}
        style={style}
      >
        {children.map((childId) => (
          <React.Fragment key={childId}>
            <NodeErrorBoundary nodeId={childId}>
              <RenderNode
                nodeId={childId}
                parentId={resolved.id}
                document={args.document}
                ctx={args.ctx}
                boxesById={args.boxesById}
                prefabRegistry={args.prefabRegistry}
                dataSources={args.dataSources}
                globalNodesById={args.globalNodesById}
                includes={args.includes}
              />
            </NodeErrorBoundary>
          </React.Fragment>
        ))}
      </div>
    );
  }

  if (resolved.type === "rect") {
    return <div data-node-id={resolved.id} data-node-type={resolved.type} style={style} />;
  }

  if (resolved.type === "text") {
    const Tag = resolved.tag ?? "p";
    const content = resolveValueToString({
      value: resolved.text,
      ctx: args.ctx,
      dataSources: args.dataSources,
    });
    if (resolved.align) style.textAlign = resolved.align;
    if (resolved.style?.typography?.fontFamily) style.fontFamily = resolved.style.typography.fontFamily;
    if (resolved.style?.typography?.fontSize) style.fontSize = toCssLengthPx(resolved.style.typography.fontSize);
    if (resolved.style?.typography?.lineHeight) style.lineHeight = toCssLengthPx(resolved.style.typography.lineHeight);
    if (resolved.style?.typography?.letterSpacing !== undefined) {
      style.letterSpacing = toCssLengthPx(resolved.style.typography.letterSpacing);
    }
    if (resolved.style?.typography?.fontWeight) style.fontWeight = `${resolved.style.typography.fontWeight}`;

    return (
      <Tag data-node-id={resolved.id} data-node-type={resolved.type} style={style}>
        {content}
      </Tag>
    );
  }

  if (resolved.type === "image") {
    const src = resolveValueToString({
      value: resolved.src,
      ctx: args.ctx,
      dataSources: args.dataSources,
    });
    const alt = resolveValueToString({
      value: resolved.alt,
      ctx: args.ctx,
      dataSources: args.dataSources,
    });
    if (resolved.objectFit) {
      style.objectFit = resolved.objectFit;
    }
    return (
      <img
        data-node-id={resolved.id}
        data-node-type={resolved.type}
        style={style}
        src={src}
        alt={alt}
      />
    );
  }

  if (resolved.type === "embed") {
    const url = resolveValueToString({
      value: resolved.url,
      ctx: args.ctx,
      dataSources: args.dataSources,
    });
    return (
      <iframe
        data-node-id={resolved.id}
        data-node-type={resolved.type}
        style={style}
        src={url}
        title={resolved.name ?? resolved.id}
      />
    );
  }

  if (resolved.type === "prefab_instance") {
    const isProd = isProductionEnv();

    const registry = args.prefabRegistry;
    if (!registry) {
      return (
        <div data-node-id={resolved.id} data-node-type={resolved.type} style={style}>
          <div data-celestial="prefab-missing">Missing PrefabRegistry</div>
        </div>
      );
    }

    const def = registry.get(resolved.prefabId);
    if (!def) {
      return (
        <div data-node-id={resolved.id} data-node-type={resolved.type} style={style}>
          <div data-celestial="prefab-missing">Unknown prefab: {resolved.prefabId}</div>
        </div>
      );
    }

    const propsValidation = validatePrefabInstancePropsV1({
      manifest: def.manifest,
      props: resolved.props as Record<string, unknown>,
    });

    if (!propsValidation.ok) {
      return (
        <div data-node-id={resolved.id} data-node-type={resolved.type} style={style}>
          <div data-celestial="prefab-props-invalid">Invalid prefab props</div>
          {!isProd ? (
            <pre data-celestial="prefab-props-errors">{propsValidation.errors.join("\n")}</pre>
          ) : null}
        </div>
      );
    }

    const slotValidation = validateSlotChildrenAgainstManifest({
      manifest: def.manifest,
      slotChildren: resolved.slotChildren,
      globalNodesById: args.globalNodesById,
    });

    if (!slotValidation.ok && !isProd) {
      // eslint-disable-next-line no-console
      console.warn("[site-renderer-core] Prefab slot validation failed", {
        nodeId: resolved.id,
        prefabId: resolved.prefabId,
        errors: slotValidation.errors,
        warnings: slotValidation.warnings,
      });
    }

    // style overrides whitelist：仅允许声明项
    const filteredStyle = filterStyleByWhitelist({
      style: resolved.style,
      whitelist: def.manifest.styleOverrideWhitelist,
    });
    applyStyle(style, filteredStyle);

    // 绑定：将 prefab props 解析为 plain values，供模板中的 binding 使用
    const prefabPropsPlain = resolvePrefabPropsToPlainValues({
      props: propsValidation.normalizedProps,
      ctx: args.ctx,
      data: args.dataSources,
    });

    const expanded = expandPrefabInstanceV1({
      instance: { ...resolved, props: propsValidation.normalizedProps },
      def,
      globalNodesById: args.globalNodesById,
    });

    if (expanded.warnings.length && !isProd) {
      // eslint-disable-next-line no-console
      console.warn("[site-renderer-core] Prefab expansion warnings", {
        nodeId: resolved.id,
        prefabId: resolved.prefabId,
        warnings: expanded.warnings,
      });
    }

    const innerViewport = {
      width: box?.width ?? 0,
      height: box?.height ?? 0,
      baseWidth: box?.width ?? 0,
      baseHeight: box?.height ?? 0,
    };

    return (
      <div
        data-node-id={resolved.id}
        data-node-type={resolved.type}
        data-prefab-id={resolved.prefabId}
        style={style}
      >
        <DesignSubdocumentRenderer
          document={expanded.document}
          ctx={args.ctx}
          viewport={innerViewport}
          prefabRegistry={registry}
          dataSources={{
            ...(args.dataSources ?? {}),
            prefabProps: prefabPropsPlain,
          }}
          includes={args.includes}
        />
      </div>
    );
  }

  if (resolved.type === "content_ref") {
    const isProd = isProductionEnv();
    const mode = args.ctx.mode === "preview" ? "preview" : "public";

    const refState = resolveRefState(resolved.refState, mode);
    const includeKey = `${resolved.refEntryId}:${refState}`;
    const include = args.includes?.[includeKey];

    if (!include?.document || include.error) {
      const errorCode = include?.error?.code ?? "NOT_FOUND";
      if (!isProd) {
        const debugStyle: React.CSSProperties = {
          ...style,
          border: "2px dashed red",
          padding: 8,
          color: "red",
          fontSize: 12,
          whiteSpace: "pre-wrap",
        };
        return (
          <div
            data-node-id={resolved.id}
            data-node-type={resolved.type}
            data-ref-entry-id={resolved.refEntryId}
            data-content-ref-error={errorCode}
            style={debugStyle}
          >
            {`[Missing ref: ${resolved.refEntryId} (${errorCode})]`}
          </div>
        );
      }

      return (
        <div
          data-node-id={resolved.id}
          data-node-type={resolved.type}
          data-ref-entry-id={resolved.refEntryId}
          data-content-ref-error={errorCode}
          style={style}
        />
      );
    }

    const innerViewport = {
      width: box?.width ?? 0,
      height: box?.height ?? 0,
      baseWidth: box?.width ?? 0,
      baseHeight: box?.height ?? 0,
    };

    const refPropsPlain = resolved.props
      ? resolvePrefabPropsToPlainValues({
          props: resolved.props,
          ctx: args.ctx,
          data: args.dataSources,
        })
      : undefined;

    const refDataSources: DesignRenderDataSourcesV1 = {
      ...(args.dataSources ?? {}),
      ...(include.data ? { primaryEntry: { id: resolved.refEntryId, data: include.data } } : {}),
      ...(refPropsPlain
        ? { prefabProps: { ...(args.dataSources?.prefabProps ?? {}), ...refPropsPlain } }
        : {}),
    };

    return (
      <div
        data-node-id={resolved.id}
        data-node-type={resolved.type}
        data-ref-entry-id={resolved.refEntryId}
        style={style}
      >
        <DesignSubdocumentRenderer
          document={include.document}
          ctx={args.ctx}
          viewport={innerViewport}
          prefabRegistry={args.prefabRegistry ?? createDefaultPrefabRegistryV1()}
          dataSources={refDataSources}
          includes={args.includes}
          nodeIdPrefix={`cr_${resolved.id}_`}
        />
      </div>
    );
  }

  return null;
}

function prefixPageBlueprintNodeIds(args: {
  document: PageBlueprint;
  prefix: string;
}): PageBlueprint {
  const nodesById: Record<string, DesignNodeV1> = {};
  for (const [id, node] of Object.entries(args.document.nodesById)) {
    const nextId = `${args.prefix}${id}`;
    const base = { ...(node as any), id: nextId } as any;

    if (Array.isArray((node as any).children)) {
      base.children = (node as any).children.map((childId: string) => `${args.prefix}${childId}`);
    }

    if (node.type === "prefab_instance" && (node as any).slotChildren) {
      const slotChildren: Record<string, string[]> = {};
      for (const [slotName, ids] of Object.entries((node as any).slotChildren as Record<string, unknown>)) {
        if (!Array.isArray(ids)) continue;
        slotChildren[slotName] = (ids as string[]).map((childId) => `${args.prefix}${childId}`);
      }
      base.slotChildren = slotChildren;
    }

    nodesById[nextId] = base as DesignNodeV1;
  }

  return {
    ...args.document,
    rootId: `${args.prefix}${args.document.rootId}`,
    nodesById,
  };
}

function DesignSubdocumentRenderer(props: {
  document: PageBlueprint;
  ctx: ViewerContext;
  viewport: PageBlueprintRendererViewport;
  prefabRegistry: PrefabRegistryV1;
  dataSources: DesignRenderDataSourcesV1 | undefined;
  includes: ContentRefIncludesMap | undefined;
  nodeIdPrefix?: string;
}) {
  // Subdocument renderer: used for prefab expansions and content_ref documents.
  const document = props.nodeIdPrefix
    ? prefixPageBlueprintNodeIds({ document: props.document, prefix: props.nodeIdPrefix })
    : props.document;

  // Must be a valid PageBlueprint (root is page_root).
  if (!isPageBlueprint(document)) {
    return <div data-celestial="subdocument-invalid" />;
  }

  const layoutNodes = toLayoutNodes({ document, ctx: props.ctx, dataSources: props.dataSources });
  const viewportArgs: LayoutComputeViewport = Object.assign(
    {},
    { width: props.viewport.width, height: props.viewport.height },
    typeof props.viewport.baseWidth === "number" ? { baseWidth: props.viewport.baseWidth } : {},
    typeof props.viewport.baseHeight === "number" ? { baseHeight: props.viewport.baseHeight } : {},
  );

  const layoutResult = computeLayoutBoxes({
    rootId: document.rootId,
    nodesById: layoutNodes,
    viewport: viewportArgs,
  });

  const root = document.nodesById[document.rootId];
  if (!root || root.type !== "page_root") return null;

  const containerStyle: React.CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
  };

  return (
    <div data-celestial="subdocument" style={containerStyle}>
      {root.children.map((childId) => (
        <React.Fragment key={childId}>
          <NodeErrorBoundary nodeId={childId}>
            <RenderNode
              nodeId={childId}
              parentId={document.rootId}
              document={document}
              ctx={props.ctx}
              boxesById={layoutResult.boxesById}
              prefabRegistry={props.prefabRegistry}
              dataSources={props.dataSources}
              globalNodesById={document.nodesById}
              includes={props.includes}
            />
          </NodeErrorBoundary>
        </React.Fragment>
      ))}
    </div>
  );
}

function RenderErrorPanel(props: { title: string; detail?: string }) {
  const isProd = isProductionEnv();
  return (
    <div role="alert" data-celestial="design-document-error">
      <div data-celestial="design-document-error-title">{props.title}</div>
      {!isProd && props.detail ? <pre data-celestial="design-document-error-detail">{props.detail}</pre> : null}
    </div>
  );
}

class NodeErrorBoundary extends React.Component<
  { nodeId: string; children: ReactNode },
  { hasError: boolean; message?: string }
> {
  override state: { hasError: boolean; message?: string } = { hasError: false };

  static getDerivedStateFromError(error: unknown): { hasError: boolean; message?: string } {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return { hasError: true, message: msg };
  }

  override componentDidCatch(error: unknown): void {
    const isProd = isProductionEnv();
    if (typeof console === "undefined" || typeof console.error !== "function") return;
    if (isProd) {
      console.error("[site-renderer-core] Node render failed", { nodeId: this.props.nodeId });
      return;
    }
    console.error("[site-renderer-core] Node render failed", { nodeId: this.props.nodeId, error });
  }

  override render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    const isProd = isProductionEnv();
    return (
      <div role="alert" data-celestial="node-error" data-node-id={this.props.nodeId}>
        <div data-celestial="node-error-title">Node render error</div>
        <div data-celestial="node-error-meta">{this.props.nodeId}</div>
        {!isProd && this.state.message ? <pre data-celestial="node-error-message">{this.state.message}</pre> : null}
      </div>
    );
  }
}
