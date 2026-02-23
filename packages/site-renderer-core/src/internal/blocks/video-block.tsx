import type { BlockNode, ViewerContext } from "@celestial/site-block-protocol";

// 视频块渲染器
export function VideoBlock({ block, ctx }: { block: BlockNode; ctx: ViewerContext }) {
  const props = block.props as {
    src?: string;
    poster?: string;
    autoplay?: boolean;
    loop?: boolean;
    muted?: boolean;
  };

  return (
    <video
      data-block-type={block.type}
      data-block-id={block.id}
      src={typeof props.src === "string" ? props.src : undefined}
      poster={typeof props.poster === "string" ? props.poster : undefined}
      autoPlay={!!props.autoplay}
      loop={!!props.loop}
      muted={!!props.muted}
      controls={!props.autoplay}
    />
  );
}
