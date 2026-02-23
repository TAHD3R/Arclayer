import type React from "react";
import type { BlockNode, ViewerContext } from "@celestial/site-block-protocol";

// 图片块渲染器
export function ImageBlock({ block, ctx }: { block: BlockNode; ctx: ViewerContext }) {
  const props = block.props as { src?: string; alt?: string; objectFit?: string };
  const src = typeof props.src === "string" ? props.src : "";
  const alt = typeof props.alt === "string" ? props.alt : "";

  return (
    <img
      data-block-type={block.type}
      data-block-id={block.id}
      src={src}
      alt={alt}
      style={props.objectFit ? { objectFit: props.objectFit as React.CSSProperties["objectFit"] } : undefined}
    />
  );
}
