import React from "react";
import type { ReactNode } from "react";

import type { ViewerContext } from "@celestial/site-block-protocol";
import type { CoreBlockNode, CoreDocumentIR } from "./core-blocks";
import { renderCoreBlock } from "./core-blocks";

export interface DocumentRendererProps {
  document: CoreDocumentIR;
  ctx: ViewerContext;
}

type ProcessLike = {
  env?: {
    NODE_ENV?: string;
  };
};

function isProductionEnv(): boolean {
  if (typeof globalThis === "undefined") return false;

  const processLike = (globalThis as typeof globalThis & { process?: unknown }).process;
  if (!processLike || typeof processLike !== "object") return false;

  const env = (processLike as ProcessLike).env;
  return env?.NODE_ENV === "production";
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
    const isProd = isProductionEnv();

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

    const isProd = isProductionEnv();

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
