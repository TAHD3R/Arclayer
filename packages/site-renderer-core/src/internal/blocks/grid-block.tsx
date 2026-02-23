import React from "react";
import type { BlockNode, ViewerContext } from "@celestial/site-block-protocol";
import type { BlockRegistry } from "../BlockRegistry";

// 网格容器渲染器：CSS Grid 布局，递归渲染子块
export function GridBlock({
  block,
  ctx,
  registry,
}: {
  block: BlockNode;
  ctx: ViewerContext;
  registry: BlockRegistry;
}) {
  const props = block.props as { columns?: number; columnGap?: string; rowGap?: string };

  const style: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: `repeat(${props.columns ?? 2}, 1fr)`,
    columnGap: props.columnGap,
    rowGap: props.rowGap,
  };

  return (
    <div data-block-type={block.type} data-block-id={block.id} style={style}>
      {block.children?.map((child) => (
        <React.Fragment key={child.id}>{registry.render(child, ctx)}</React.Fragment>
      ))}
    </div>
  );
}
