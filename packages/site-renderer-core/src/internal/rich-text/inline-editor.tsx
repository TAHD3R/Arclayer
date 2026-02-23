import { useCallback } from "react";

import type { PortableTextContent } from "@celestial/site-block-protocol";

import { PortableTextRenderer } from "./portable-text-renderer";

interface InlineEditorProps {
  content: PortableTextContent;
  onChange?: (content: PortableTextContent) => void;
  editable?: boolean;
  className?: string;
}

/**
 * Skeleton inline editor — renders content via PortableTextRenderer inside a
 * contentEditable wrapper. Will be replaced by Tiptap in a later phase.
 */
export function InlineEditor({ content, onChange, editable = true, className }: InlineEditorProps) {
  const handleBlur = useCallback(() => {
    onChange?.(content);
  }, [onChange, content]);

  return (
    <div
      contentEditable={editable}
      suppressContentEditableWarning
      onBlur={handleBlur}
      className={className}
    >
      <PortableTextRenderer content={content} />
    </div>
  );
}
