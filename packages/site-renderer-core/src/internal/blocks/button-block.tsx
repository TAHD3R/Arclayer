import type { BlockNode, ViewerContext, LocalizedString } from "@celestial/site-block-protocol";
import { resolveLocalizedValue } from "@celestial/site-block-protocol";

// 按钮块渲染器：有 href 时渲染为 <a>，否则渲染为 <button>
export function ButtonBlock({ block, ctx }: { block: BlockNode; ctx: ViewerContext }) {
  const props = block.props as { text?: LocalizedString; href?: string; variant?: string; size?: string };
  const text = resolveLocalizedValue(props.text, ctx) ?? "";

  if (props.href) {
    const href = resolveHref(props.href, ctx.basePath);
    return (
      <a
        data-block-type={block.type}
        data-block-id={block.id}
        href={href}
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

function resolveHref(href: string, basePath: string | undefined): string {
  const raw = (href || "").trim();
  if (!raw) return raw;

  // Only prefix absolute-path links. Keep external URLs, protocol-relative URLs, hashes, and mailto/tel intact.
  if (!raw.startsWith("/") || raw.startsWith("//")) return raw;

  const base = (basePath || "").trim();
  if (!base) return raw;

  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  return normalizedBase + raw;
}
