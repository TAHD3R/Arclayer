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
        <React.Fragment key={block.id}>
          <BlockErrorBoundary blockId={block.id} blockType={block.type}>
            {render(block, ctx)}
          </BlockErrorBoundary>
        </React.Fragment>
      ))}
    </main>
  );
}

function render(block: CoreBlockNode, ctx: ViewerContext): ReactNode {
  return renderCoreBlock(block, ctx);
}

interface BlockErrorBoundaryProps {
  blockId: string;
  blockType: string;
  children: ReactNode;
}

interface BlockErrorBoundaryState {
  hasError: boolean;
  message?: string;
}

// React error boundaries must be class components.
class BlockErrorBoundary extends React.Component<BlockErrorBoundaryProps, BlockErrorBoundaryState> {
  override state: BlockErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: unknown): BlockErrorBoundaryState {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return { hasError: true, message: msg };
  }

  override componentDidCatch(error: unknown): void {
    // Keep errors visible during development without breaking the whole page.
    // In production, avoid logging the raw error object to reduce risk of leaking sensitive data.
    const isProd =
      typeof globalThis !== "undefined" &&
      typeof (globalThis as any).process !== "undefined" &&
      (globalThis as any).process?.env?.NODE_ENV === "production";

    if (typeof console === "undefined" || typeof console.error !== "function") return;
    if (isProd) {
      console.error("[site-renderer-core] Block render failed", {
        blockId: this.props.blockId,
        blockType: this.props.blockType,
      });
      return;
    }

    console.error("[site-renderer-core] Block render failed", {
      blockId: this.props.blockId,
      blockType: this.props.blockType,
      error,
    });
  }

  override render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    const isProd =
      typeof globalThis !== "undefined" &&
      typeof (globalThis as any).process !== "undefined" &&
      (globalThis as any).process?.env?.NODE_ENV === "production";

    return (
      <div
        role="alert"
        data-celestial="block-error"
        data-block-id={this.props.blockId}
        data-block-type={this.props.blockType}
      >
        <div data-celestial="block-error-title">Block render error</div>
        <div data-celestial="block-error-meta">
          {this.props.blockType}#{this.props.blockId}
        </div>
        {!isProd && this.state.message ? (
          <pre data-celestial="block-error-message">{this.state.message}</pre>
        ) : null}
      </div>
    );
  }
}
