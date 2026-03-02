import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import type { PageBlueprint } from "@celestial/site-block-protocol";
import type { PrefabRegistryV1 } from "@celestial/site-renderer-core";

type Rect = { x: number; y: number; width: number; height: number };

function safeCssEscape(value: string): string {
  const raw = String(value || "");
  const c = (globalThis as any)?.CSS;
  if (c && typeof c.escape === "function") return c.escape(raw);
  return raw.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function measureNodeBoxRelativeToCanvas(args: {
  canvasRootEl: HTMLElement | null;
  nodeId: string;
}): Rect | null {
  const root = args.canvasRootEl;
  if (!root) return null;
  const el = root.querySelector(
    `[data-node-id="${safeCssEscape(args.nodeId)}"]`,
  ) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const c = root.getBoundingClientRect();
  return {
    x: Math.round(r.left - c.left),
    y: Math.round(r.top - c.top),
    width: Math.round(r.width),
    height: Math.round(r.height),
  };
}

function outlineBoxStyle(args: {
  rect: Rect;
  color: string;
  dashed?: boolean;
  offset?: number;
}): CSSProperties {
  const offset = args.offset ?? 0;
  return {
    position: "absolute",
    left: args.rect.x - offset,
    top: args.rect.y - offset,
    width: args.rect.width + offset * 2,
    height: args.rect.height + offset * 2,
    boxSizing: "border-box",
    border: args.dashed ? `1px dashed ${args.color}` : `1px solid ${args.color}`,
    borderRadius: 2,
    pointerEvents: "none",
    zIndex: 30,
  };
}

function toSafeSegment(value: string): string {
  return String(value || "").replaceAll(/[^A-Za-z0-9:_-]/g, "_");
}

function resolveHoverLabel(args: {
  doc: PageBlueprint;
  prefabRegistry: PrefabRegistryV1;
  renderedId: string;
}): string | null {
  const id = (args.renderedId || "").trim();
  if (!id) return null;

  const node = args.doc.nodesById[id];
  if (node) {
    const name = (node as any).name ? String((node as any).name) : "";
    if (name.trim()) return `${name.trim()} · ${node.type}`;
    if (node.type === "prefab_instance")
      return `Prefab · ${(node.prefabId || "").trim() || node.id}`;
    return `${node.type}`;
  }

  for (const n of Object.values(args.doc.nodesById)) {
    if (!n || n.type !== "prefab_instance") continue;
    const safePrefabId = toSafeSegment(String(n.prefabId || ""));
    const safeInstanceId = toSafeSegment(String(n.id || ""));
    const prefix = `p_${safePrefabId}_${safeInstanceId}_`;
    if (!id.startsWith(prefix)) continue;
    const templateNodeId = id.slice(prefix.length).trim();
    const def = args.prefabRegistry.get(n.prefabId);
    const tplNode = def?.template.nodesById[templateNodeId] as any;
    const tplName = tplNode?.name ? String(tplNode.name) : "";
    const tplType = tplNode?.type ? String(tplNode.type) : "node";
    const main = (n.prefabId || "").trim() || "prefab";
    const child = tplName.trim() ? tplName.trim() : templateNodeId || "part";
    return `${main} / ${child} · ${tplType}`;
  }

  return null;
}

export function NodeHoverOverlayLayer(props: {
  enabled: boolean;
  doc: PageBlueprint;
  prefabRegistry: PrefabRegistryV1;
  canvasRootEl: HTMLElement | null;
  scrollerEl: HTMLElement | null;
  selectedRenderedNodeId: string | null;
  hoveredRenderedNodeId: string | null;
  hoveredSelectableNodeId: string | null;
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!props.scrollerEl) return;
    const el = props.scrollerEl;
    const onScroll = () => setTick((x) => x + 1);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [props.scrollerEl]);

  useEffect(() => {
    const onResize = () => setTick((x) => x + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const hoveredRect = useMemo(() => {
    if (!props.enabled) return null;
    const id = (props.hoveredRenderedNodeId || "").trim();
    if (!id) return null;
    void tick;
    return measureNodeBoxRelativeToCanvas({ canvasRootEl: props.canvasRootEl, nodeId: id });
  }, [props.canvasRootEl, props.enabled, props.hoveredRenderedNodeId, tick]);

  const hoveredSelectableRect = useMemo(() => {
    if (!props.enabled) return null;
    const id = (props.hoveredSelectableNodeId || "").trim();
    if (!id) return null;
    if (id === props.selectedRenderedNodeId) return null;
    if (id === props.hoveredRenderedNodeId) return null;
    void tick;
    return measureNodeBoxRelativeToCanvas({ canvasRootEl: props.canvasRootEl, nodeId: id });
  }, [
    props.canvasRootEl,
    props.enabled,
    props.hoveredRenderedNodeId,
    props.hoveredSelectableNodeId,
    props.selectedRenderedNodeId,
    tick,
  ]);

  const selectedRect = useMemo(() => {
    if (!props.enabled) return null;
    const id = (props.selectedRenderedNodeId || "").trim();
    if (!id) return null;
    void tick;
    return measureNodeBoxRelativeToCanvas({ canvasRootEl: props.canvasRootEl, nodeId: id });
  }, [props.canvasRootEl, props.enabled, props.selectedRenderedNodeId, tick]);

  const hoveredLabel = useMemo(() => {
    if (!props.enabled) return null;
    const id = (props.hoveredRenderedNodeId || "").trim();
    if (!id) return null;
    return resolveHoverLabel({
      doc: props.doc,
      prefabRegistry: props.prefabRegistry,
      renderedId: id,
    });
  }, [props.doc, props.enabled, props.hoveredRenderedNodeId, props.prefabRegistry]);

  if (!props.enabled) return null;

  return (
    <>
      {selectedRect ? (
        <div
          style={outlineBoxStyle({
            rect: selectedRect,
            color: "#1677ff",
            dashed: false,
            offset: 2,
          })}
        />
      ) : null}
      {hoveredSelectableRect ? (
        <div
          style={outlineBoxStyle({
            rect: hoveredSelectableRect,
            color: "rgba(22,119,255,0.35)",
            dashed: true,
            offset: 4,
          })}
        />
      ) : null}
      {hoveredRect && props.hoveredRenderedNodeId !== props.selectedRenderedNodeId ? (
        <div
          style={outlineBoxStyle({
            rect: hoveredRect,
            color: "rgba(22,119,255,0.85)",
            dashed: true,
            offset: 2,
          })}
        />
      ) : null}
      {hoveredRect && hoveredLabel ? (
        <div
          style={{
            position: "absolute",
            left: hoveredRect.x,
            top: Math.max(0, hoveredRect.y - 22),
            zIndex: 35,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              background: "#1677ff",
              color: "white",
              fontSize: 12,
              lineHeight: "18px",
              padding: "2px 8px",
              borderRadius: 6,
              boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
              maxWidth: 320,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={hoveredLabel}
          >
            {hoveredLabel}
          </div>
        </div>
      ) : null}
    </>
  );
}
