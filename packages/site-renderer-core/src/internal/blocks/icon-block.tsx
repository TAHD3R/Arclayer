import type { BlockNode, ViewerContext } from "@celestial/site-block-protocol";

// 图标占位渲染器：通过 data 属性传递图标名称
export function IconBlock({ block }: { block: BlockNode; ctx: ViewerContext }) {
  const props = block.props as { name?: string; size?: string };
  return (
    <span
      data-block-type={block.type}
      data-block-id={block.id}
      data-icon={props.name}
      style={props.size ? { fontSize: props.size } : undefined}
      role="img"
      aria-label={props.name}
    />
  );
}
