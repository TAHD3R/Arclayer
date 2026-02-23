import type {
  PortableTextContent,
  PortableTextBlock,
  PortableTextSpan,
  PortableTextChild,
} from "@celestial/site-block-protocol";

interface PortableTextRendererProps {
  content: PortableTextContent;
  className?: string;
}

const STYLE_TAG: Record<PortableTextBlock["style"], keyof React.JSX.IntrinsicElements> = {
  normal: "p",
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  blockquote: "blockquote",
};

const MARK_TAG: Record<string, keyof React.JSX.IntrinsicElements> = {
  strong: "strong",
  em: "em",
  underline: "u",
  code: "code",
};

function renderSpan(child: PortableTextChild) {
  if (child._type !== "span") return null;
  const span = child as PortableTextSpan;
  let node: React.ReactNode = span.text;
  for (const mark of span.marks ?? []) {
    const Tag = MARK_TAG[mark];
    if (Tag) node = <Tag key={mark}>{node}</Tag>;
  }
  return <span key={span._key}>{node}</span>;
}

function renderBlock(block: PortableTextBlock) {
  const Tag = STYLE_TAG[block.style] ?? "p";
  const children = block.children.map(renderSpan);

  if (block.listItem) {
    return <li key={block._key}>{children}</li>;
  }
  return <Tag key={block._key}>{children}</Tag>;
}

export function PortableTextRenderer({ content, className }: PortableTextRendererProps) {
  const elements: React.ReactNode[] = [];
  let listBuffer: { items: PortableTextBlock[]; type: "bullet" | "number" } | null = null;

  const flushList = () => {
    if (!listBuffer) return;
    const ListTag = listBuffer.type === "number" ? "ol" : "ul";
    elements.push(
      <ListTag key={`list-${listBuffer.items[0]?._key}`}>
        {listBuffer.items.map(renderBlock)}
      </ListTag>,
    );
    listBuffer = null;
  };

  for (const node of content) {
    if (node._type !== "block") continue;
    const block = node as PortableTextBlock;

    if (block.listItem) {
      if (listBuffer && listBuffer.type === block.listItem) {
        listBuffer.items.push(block);
      } else {
        flushList();
        listBuffer = { items: [block], type: block.listItem };
      }
    } else {
      flushList();
      elements.push(renderBlock(block));
    }
  }
  flushList();

  return <div className={className}>{elements}</div>;
}
