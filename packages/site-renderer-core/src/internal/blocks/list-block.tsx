import type { BlockNode, ViewerContext, LocalizedString } from "@celestial/site-block-protocol";
import { resolveLocalizedValue } from "@celestial/site-block-protocol";

// 列表块渲染器：支持有序/无序列表
export function ListBlock({ block, ctx }: { block: BlockNode; ctx: ViewerContext }) {
  const props = block.props as { ordered?: boolean; items?: LocalizedString[] };
  const Tag = props.ordered ? "ol" : "ul";
  const items = Array.isArray(props.items) ? props.items : [];

  return (
    <Tag data-block-type={block.type} data-block-id={block.id}>
      {items.map((item, i) => (
        <li key={i}>{resolveLocalizedValue(item, ctx) ?? ""}</li>
      ))}
    </Tag>
  );
}
