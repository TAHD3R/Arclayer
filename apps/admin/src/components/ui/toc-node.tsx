import type { PlateElementProps } from "platejs/react";

import { ListTree } from "lucide-react";
import { PlateElement, useEditorRef } from "platejs/react";
import { useTranslation } from "react-i18next";

export function TocElement(props: PlateElementProps) {
  const { t } = useTranslation("content");
  const editor = useEditorRef();
  const headings = editor.api
    .blocks()
    .filter(([node]) => ["h1", "h2", "h3"].includes(String((node as { type?: string }).type)));

  return (
    <PlateElement
      {...props}
      as="nav"
      className="my-6 rounded-2xl border border-border/70 bg-muted/20 p-4"
    >
      <div className="mb-3 inline-flex items-center gap-2 text-callout font-medium text-label-primary">
        <ListTree className="size-4" />
        {t("CONTENT_LIBRARY_EDITOR_INSERT_TOC")}
      </div>
      <div className="space-y-2 text-callout text-label-secondary">
        {headings.length > 0 ? (
          headings.map(([node], index) => (
            <div key={`${String((node as { id?: string }).id ?? index)}`} className="truncate">
              {(node as { children?: Array<{ text?: string }> }).children
                ?.map((child) => child.text ?? "")
                .join("") || `Heading ${index + 1}`}
            </div>
          ))
        ) : (
          <div>{t("CONTENT_LIBRARY_EDITOR_TOC_EMPTY")}</div>
        )}
      </div>
      {props.children}
    </PlateElement>
  );
}
