import type { ReactNode } from "react";
import React from "react";

import type { ViewerContext } from "@celestial/site-block-protocol";
import type { CoreBlockNode, CoreDocumentIR } from "./core-blocks";
import { renderCoreBlock } from "./core-blocks";

export interface DocumentRendererProps {
  document: CoreDocumentIR;
  ctx: ViewerContext;
}

export function DocumentRenderer(props: DocumentRendererProps) {
  const { document, ctx } = props;

  return (
    <main data-celestial="document" data-ir-version={document.version}>
      {document.blocks.map((block) => (
        <React.Fragment key={block.id}>{render(block, ctx)}</React.Fragment>
      ))}
    </main>
  );
}

function render(block: CoreBlockNode, ctx: ViewerContext): ReactNode {
  return renderCoreBlock(block, ctx);
}
