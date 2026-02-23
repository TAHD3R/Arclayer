import type { BlockNode, ViewerContext } from "@celestial/site-block-protocol";
import type { BlockRenderer } from "../BlockRegistry";

import { ImageBlock } from "./image-block";
import { ButtonBlock } from "./button-block";
import { VideoBlock } from "./video-block";
import { GridBlock } from "./grid-block";
import { SpacerBlock } from "./spacer-block";
import { IconBlock } from "./icon-block";
import { ListBlock } from "./list-block";
import { QuoteBlock } from "./quote-block";

/**
 * 8 个新增核心块的渲染器映射。
 * key 为 block type，value 为 BlockRenderer 函数。
 */
export const coreBlockRenderers: Record<string, BlockRenderer> = {
  image: (node, ctx) => <ImageBlock block={node} ctx={ctx} />,
  button: (node, ctx) => <ButtonBlock block={node} ctx={ctx} />,
  video: (node, ctx) => <VideoBlock block={node} ctx={ctx} />,
  grid: (node, ctx, registry) => <GridBlock block={node} ctx={ctx} registry={registry} />,
  spacer: (node, ctx) => <SpacerBlock block={node} ctx={ctx} />,
  icon: (node, ctx) => <IconBlock block={node} ctx={ctx} />,
  list: (node, ctx) => <ListBlock block={node} ctx={ctx} />,
  quote: (node, ctx) => <QuoteBlock block={node} ctx={ctx} />,
};
