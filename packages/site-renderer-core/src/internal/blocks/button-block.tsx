import type { BlockNode, ViewerContext, LocalizedString } from "@celestial/site-block-protocol";
import { resolveLocalizedValue } from "@celestial/site-block-protocol";

// 按钮块渲染器：有 href 时渲染为 <a>，否则渲染为 <button>
export function ButtonBlock({ block, ctx }: { block: BlockNode; ctx: ViewerContext }) {
  const props = block.props as { text?: LocalizedString; href?: string; variant?: string; size?: string };
  const text = resolveLocalizedValue(props.text, ctx) ?? "";

  if (props.href) {
    return (
      <a
        data-block-type={block.type}
        data-block-id={block.id}
        href={props.href}
        data-variant={props.variant}
        data-size={props.size}
      >
        {text}
      </a>
    );
  }

  return (
    <button
      data-block-type={block.type}
      data-block-id={block.id}
      data-variant={props.variant}
      data-size={props.size}
    >
      {text}
    </button>
  );
}
