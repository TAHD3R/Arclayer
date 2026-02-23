import type { BlockNode, ViewerContext, LocalizedString } from "@celestial/site-block-protocol";
import { resolveLocalizedValue } from "@celestial/site-block-protocol";

// 引用块渲染器
export function QuoteBlock({ block, ctx }: { block: BlockNode; ctx: ViewerContext }) {
  const props = block.props as { text?: LocalizedString; citation?: LocalizedString };
  const text = resolveLocalizedValue(props.text, ctx) ?? "";
  const citation = resolveLocalizedValue(props.citation, ctx);

  return (
    <blockquote data-block-type={block.type} data-block-id={block.id}>
      <p>{text}</p>
      {citation ? <cite>{citation}</cite> : null}
    </blockquote>
  );
}
