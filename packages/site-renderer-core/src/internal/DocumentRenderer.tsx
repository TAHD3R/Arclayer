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
    // Avoid logging sensitive information in production.
    if (typeof console !== "undefined" && typeof console.error === "function") {
      console.error("[site-renderer-core] Block render failed", {
        blockId: this.props.blockId,
        blockType: this.props.blockType,
        error,
      });
    }
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
        style={{
          border: "1px solid rgba(239, 68, 68, 0.4)",
          background: "rgba(239, 68, 68, 0.06)",
          color: "#991b1b",
          padding: 12,
          borderRadius: 8,
          margin: "12px 0",
          fontFamily: "var(--font-sans, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif)",
        }}
      >
        <div style={{ fontWeight: 600 }}>Block render error</div>
        <div style={{ fontSize: 12, opacity: 0.9 }}>
          {this.props.blockType}#{this.props.blockId}
        </div>
        {!isProd && this.state.message ? (
          <pre style={{ marginTop: 8, fontSize: 12, whiteSpace: "pre-wrap" }}>{this.state.message}</pre>
        ) : null}
      </div>
    );
  }
}
