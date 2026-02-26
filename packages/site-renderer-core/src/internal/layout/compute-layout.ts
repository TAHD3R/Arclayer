import type {
  AbsoluteConstraints,
  AbsoluteRect,
  LayoutBox,
  LayoutComputeResult,
  LayoutComputeViewport,
  LayoutNode,
  LayoutSize,
  NodeChildrenLayout,
} from "./types";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function normalizeSize(value: LayoutSize): LayoutSize {
  return {
    width: clampNonNegative(value.width),
    height: clampNonNegative(value.height),
  };
}

function normalizeViewport(viewport: LayoutComputeViewport): { actual: LayoutSize; base: LayoutSize } {
  const actual = normalizeSize({
    width: viewport.width,
    height: viewport.height,
  });

  const base = normalizeSize({
    width: viewport.baseWidth ?? actual.width,
    height: viewport.baseHeight ?? actual.height,
  });

  return { actual, base };
}

function normalizeAbsoluteRect(rect: AbsoluteRect): AbsoluteRect {
  return {
    x: isFiniteNumber(rect.x) ? rect.x : 0,
    y: isFiniteNumber(rect.y) ? rect.y : 0,
    width: clampNonNegative(rect.width),
    height: clampNonNegative(rect.height),
  };
}

function normalizeConstraints(constraints: Partial<AbsoluteConstraints> | undefined): AbsoluteConstraints {
  return {
    horizontal: constraints?.horizontal ?? "left",
    vertical: constraints?.vertical ?? "top",
  };
}

function applyConstraintsToRect(args: {
  baseRect: AbsoluteRect;
  constraints: AbsoluteConstraints;
  parentBase: LayoutSize;
  parentActual: LayoutSize;
}): AbsoluteRect {
  const baseRect = normalizeAbsoluteRect(args.baseRect);
  const constraints = args.constraints;

  const parentBase = normalizeSize(args.parentBase);
  const parentActual = normalizeSize(args.parentActual);

  const deltaW = parentActual.width - parentBase.width;
  const deltaH = parentActual.height - parentBase.height;

  const scaleX = parentBase.width > 0 ? parentActual.width / parentBase.width : 1;
  const scaleY = parentBase.height > 0 ? parentActual.height / parentBase.height : 1;

  const next = { ...baseRect };

  switch (constraints.horizontal) {
    case "left":
      break;
    case "right":
      next.x = baseRect.x + deltaW;
      break;
    case "center":
      next.x = baseRect.x + deltaW / 2;
      break;
    case "leftRight":
      next.width = clampNonNegative(baseRect.width + deltaW);
      break;
    case "scale":
      next.x = baseRect.x * scaleX;
      next.width = clampNonNegative(baseRect.width * scaleX);
      break;
  }

  switch (constraints.vertical) {
    case "top":
      break;
    case "bottom":
      next.y = baseRect.y + deltaH;
      break;
    case "center":
      next.y = baseRect.y + deltaH / 2;
      break;
    case "topBottom":
      next.height = clampNonNegative(baseRect.height + deltaH);
      break;
    case "scale":
      next.y = baseRect.y * scaleY;
      next.height = clampNonNegative(baseRect.height * scaleY);
      break;
  }

  return next;
}

function defaultMeasureText(node: LayoutNode): LayoutSize {
  const content = (node.text?.content ?? "").trim();
  const fontSize = isFiniteNumber(node.text?.fontSize) ? Math.max(1, node.text!.fontSize!) : 16;
  const lineHeight = isFiniteNumber(node.text?.lineHeight)
    ? Math.max(1, node.text!.lineHeight!)
    : Math.round(fontSize * 1.2);

  // Very conservative: assume 0.6em average glyph width.
  const approxGlyphW = fontSize * 0.6;
  const maxWidth = isFiniteNumber(node.text?.maxWidth) ? Math.max(1, node.text!.maxWidth!) : 360;

  if (!content) {
    return { width: 0, height: lineHeight };
  }

  const rawWidth = content.length * approxGlyphW;
  const width = clampNonNegative(Math.min(maxWidth, rawWidth));

  const lines = Math.max(1, Math.ceil(rawWidth / Math.max(1, maxWidth)));
  const height = clampNonNegative(lines * lineHeight);

  return { width, height };
}

function resolveNodeBaseSize(node: LayoutNode, fallback: LayoutSize): LayoutSize {
  const rect = node.positioning?.kind === "absolute" ? node.positioning.rect : null;
  if (rect && isFiniteNumber(rect.width) && isFiniteNumber(rect.height)) {
    const w = clampNonNegative(rect.width);
    const h = clampNonNegative(rect.height);
    if (w > 0 || h > 0) {
      return { width: w, height: h };
    }
  }
  return normalizeSize(fallback);
}

function resolveChildSizeForAutoLayout(args: {
  node: LayoutNode;
  measureText: (node: LayoutNode) => LayoutSize;
}): LayoutSize {
  const positioning = args.node.positioning;
  if (positioning?.kind === "absolute") {
    const rect = normalizeAbsoluteRect(positioning.rect);
    if (rect.width > 0 && rect.height > 0) return { width: rect.width, height: rect.height };
  }

  // Fallback: text -> measure; others -> 0x0
  if (args.node.type === "text") {
    return normalizeSize(args.measureText(args.node));
  }

  return { width: 0, height: 0 };
}

function normalizeChildrenLayout(layout: NodeChildrenLayout | undefined): NodeChildrenLayout {
  if (!layout) return { mode: "absolute" };
  if (layout.mode === "absolute") return layout;
  return {
    mode: "auto",
    direction: layout.direction,
    gap: isFiniteNumber(layout.gap) ? layout.gap : 0,
    padding: isFiniteNumber(layout.padding) ? layout.padding : 0,
    alignItems: layout.alignItems ?? "start",
    justifyContent: layout.justifyContent ?? "start",
  };
}

function computeAutoLayoutChildren(args: {
  parentBox: LayoutBox;
  childrenIds: string[];
  nodesById: Record<string, LayoutNode>;
  layout: Extract<NodeChildrenLayout, { mode: "auto" }>;
  measureText: (node: LayoutNode) => LayoutSize;
}): Array<{ id: string; box: LayoutBox }> {
  const alignItems = args.layout.alignItems ?? "start";
  const justifyContent = args.layout.justifyContent ?? "start";

  const padding = clampNonNegative(args.layout.padding ?? 0);
  const baseGap = clampNonNegative(args.layout.gap ?? 0);

  const inner: LayoutBox = {
    x: args.parentBox.x + padding,
    y: args.parentBox.y + padding,
    width: clampNonNegative(args.parentBox.width - padding * 2),
    height: clampNonNegative(args.parentBox.height - padding * 2),
  };

  const items = args.childrenIds
    .map((id) => {
      const node = args.nodesById[id];
      if (!node) return null;
      const size = resolveChildSizeForAutoLayout({ node, measureText: args.measureText });
      return { id, node, size };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  if (items.length === 0) return [];

  const isRow = args.layout.direction === "row";
  const mainSize = isRow ? inner.width : inner.height;
  const crossSize = isRow ? inner.height : inner.width;

  const mainSizes = items.map((it) => (isRow ? it.size.width : it.size.height));
  const crossSizes = items.map((it) => (isRow ? it.size.height : it.size.width));

  const totalBaseGap = baseGap * Math.max(0, items.length - 1);
  const totalMain = mainSizes.reduce((sum, v) => sum + clampNonNegative(v), 0) + totalBaseGap;
  const extra = Math.max(0, mainSize - totalMain);

  let startOffset = 0;
  let gap = baseGap;

  switch (justifyContent) {
    case "start":
      break;
    case "center":
      startOffset = extra / 2;
      break;
    case "end":
      startOffset = extra;
      break;
    case "space-between":
      if (items.length > 1) {
        gap = baseGap + extra / (items.length - 1);
      }
      break;
    case "space-around":
      gap = baseGap + extra / items.length;
      startOffset = gap / 2;
      break;
  }

  let cursor = startOffset;
  const out: Array<{ id: string; box: LayoutBox }> = [];

  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    if (!it) continue;

    const main = clampNonNegative(mainSizes[i] ?? 0);
    const cross = clampNonNegative(crossSizes[i] ?? 0);

    const crossPos = (() => {
      switch (alignItems) {
        case "start":
          return 0;
        case "center":
          return (crossSize - cross) / 2;
        case "end":
          return crossSize - cross;
        case "stretch":
          return 0;
      }
    })();

    const width = isRow
      ? clampNonNegative(main)
      : alignItems === "stretch"
        ? clampNonNegative(crossSize)
        : clampNonNegative(cross);
    const height = isRow
      ? alignItems === "stretch"
        ? clampNonNegative(crossSize)
        : clampNonNegative(cross)
      : clampNonNegative(main);

    const x = isRow ? inner.x + cursor : inner.x + crossPos;
    const y = isRow ? inner.y + crossPos : inner.y + cursor;

    out.push({
      id: it.id,
      box: {
        x,
        y,
        width,
        height,
      },
    });

    cursor += main;
    if (i < items.length - 1) cursor += gap;
  }

  return out;
}

export function computeLayoutBoxes(args: {
  rootId: string;
  nodesById: Record<string, LayoutNode>;
  viewport: LayoutComputeViewport;
  measureText?: (node: LayoutNode) => LayoutSize;
}): LayoutComputeResult {
  const warnings: LayoutComputeResult["warnings"] = [];
  const boxesById: LayoutComputeResult["boxesById"] = {};

  const rootNode = args.nodesById[args.rootId];
  if (!rootNode) {
    throw new Error(`Missing root node: ${args.rootId}`);
  }

  const { actual: rootActual, base: rootBase } = normalizeViewport(args.viewport);

  const rootBox: LayoutBox = { x: 0, y: 0, width: rootActual.width, height: rootActual.height };
  boxesById[args.rootId] = rootBox;

  const visiting = new Set<string>();

  const measureText = args.measureText ?? defaultMeasureText;

  const visitNode = (nodeId: string, parentBox: LayoutBox, parentBaseSize: LayoutSize): void => {
    if (visiting.has(nodeId)) {
      warnings.push({ nodeId, message: "检测到循环引用，已跳过子树布局计算" });
      return;
    }

    const node = args.nodesById[nodeId];
    if (!node) {
      warnings.push({ nodeId, message: "节点不存在（引用丢失）" });
      return;
    }

    visiting.add(nodeId);

    const childrenIds = Array.isArray(node.children) ? node.children : [];
    const childrenLayout = normalizeChildrenLayout(node.childrenLayout);

    if (childrenIds.length === 0) {
      visiting.delete(nodeId);
      return;
    }

    if (childrenLayout.mode === "absolute") {
      for (const childId of childrenIds) {
        const child = args.nodesById[childId];
        if (!child) {
          warnings.push({ nodeId: childId, message: `子节点不存在（parent=${nodeId}）` });
          continue;
        }
        const positioning = child.positioning;
        if (!positioning || positioning.kind !== "absolute") {
          warnings.push({ nodeId: childId, message: `缺少 absolute positioning（parent=${nodeId}）` });
          continue;
        }

        const baseRect = normalizeAbsoluteRect(positioning.rect);
        const constraints = normalizeConstraints(positioning.constraints);
        const mapped = applyConstraintsToRect({
          baseRect,
          constraints,
          parentBase: parentBaseSize,
          parentActual: { width: parentBox.width, height: parentBox.height },
        });

        const childBox: LayoutBox = {
          x: parentBox.x + mapped.x,
          y: parentBox.y + mapped.y,
          width: mapped.width,
          height: mapped.height,
        };
        boxesById[childId] = childBox;

        visitNode(childId, childBox, resolveNodeBaseSize(child, { width: childBox.width, height: childBox.height }));
      }

      visiting.delete(nodeId);
      return;
    }

    // auto layout
    const computedChildren = computeAutoLayoutChildren({
      parentBox,
      childrenIds,
      nodesById: args.nodesById,
      layout: childrenLayout,
      measureText,
    });

    for (const it of computedChildren) {
      boxesById[it.id] = it.box;
      const child = args.nodesById[it.id];
      if (!child) continue;
      visitNode(it.id, it.box, resolveNodeBaseSize(child, { width: it.box.width, height: it.box.height }));
    }

    visiting.delete(nodeId);
  };

  // Layout root children using root's configured childrenLayout.
  const rootChildrenLayout = normalizeChildrenLayout(rootNode.childrenLayout);
  const rootChildren = Array.isArray(rootNode.children) ? rootNode.children : [];

  if (rootChildrenLayout.mode === "auto") {
    const computedChildren = computeAutoLayoutChildren({
      parentBox: rootBox,
      childrenIds: rootChildren,
      nodesById: args.nodesById,
      layout: rootChildrenLayout,
      measureText,
    });
    for (const it of computedChildren) {
      boxesById[it.id] = it.box;
      const child = args.nodesById[it.id];
      if (!child) continue;
      visitNode(it.id, it.box, resolveNodeBaseSize(child, { width: it.box.width, height: it.box.height }));
    }
  } else {
    // absolute children layout
    for (const childId of rootChildren) {
      const child = args.nodesById[childId];
      if (!child) {
        warnings.push({ nodeId: childId, message: `子节点不存在（parent=${args.rootId}）` });
        continue;
      }
      const positioning = child.positioning;
      if (!positioning || positioning.kind !== "absolute") {
        warnings.push({ nodeId: childId, message: `缺少 absolute positioning（parent=${args.rootId}）` });
        continue;
      }

      const baseRect = normalizeAbsoluteRect(positioning.rect);
      const constraints = normalizeConstraints(positioning.constraints);
      const mapped = applyConstraintsToRect({
        baseRect,
        constraints,
        parentBase: rootBase,
        parentActual: rootActual,
      });

      const childBox: LayoutBox = {
        x: rootBox.x + mapped.x,
        y: rootBox.y + mapped.y,
        width: mapped.width,
        height: mapped.height,
      };
      boxesById[childId] = childBox;

      visitNode(childId, childBox, resolveNodeBaseSize(child, { width: childBox.width, height: childBox.height }));
    }
  }

  return {
    boxesById,
    warnings,
  };
}
