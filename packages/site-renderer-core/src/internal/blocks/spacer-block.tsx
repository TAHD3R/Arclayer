import type { BlockNode, ViewerContext } from "@celestial/site-block-protocol";

// 间距块渲染器
export function SpacerBlock({ block }: { block: BlockNode; ctx: ViewerContext }) {
  const props = block.props as { height?: string };
  return (
    <div
      data-block-type={block.type}
      data-block-id={block.id}
      style={{ height: props.height ?? "24px" }}
      aria-hidden="true"
    />
  );
}
