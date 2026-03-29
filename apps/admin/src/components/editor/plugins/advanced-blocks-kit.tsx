import { ImagePlugin } from "@platejs/media/react";

import { AdvancedBlocksKit as SharedAdvancedBlocksKit } from "@arclayer/ui/editor/plugins/advanced-blocks-kit";

import { MediaImageElement } from "@/components/ui/media-image-node";

export const AdvancedBlocksKit = [
  ...SharedAdvancedBlocksKit,
  ImagePlugin.configure({
    node: { component: MediaImageElement },
  }),
];
