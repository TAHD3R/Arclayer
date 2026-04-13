import type { PlateElementProps } from "platejs/react";

import { useTocElement, useTocElementState } from "@platejs/toc/react";
import { ListTree } from "lucide-react";
import { PlateElement } from "platejs/react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { cn } from "@arclayer/lib/utils";

function getHeadingIndent(depth: number) {
  if (depth >= 3) return "pl-5";
  if (depth === 2) return "pl-3";
  return "pl-2";
}

export function TocElement(props: PlateElementProps) {
  const { t } = useTranslation("content");
  const state = useTocElementState();
  const { props: buttonProps } = useTocElement(state);
  const { headingList } = state;

  return (
    <PlateElement {...props} as="nav" className="my-6 py-1">
      <div contentEditable={false}>
        <div className="mb-3 inline-flex items-center gap-2 text-footnote font-semibold text-label-primary">
          <ListTree className="size-4" />
          {t("CONTENT_LIBRARY_EDITOR_INSERT_TOC")}
        </div>

        <div className="space-y-1.5 text-footnote text-label-secondary">
          {headingList.length > 0 ? (
            headingList.map((item) => (
              <Button
                key={item.id}
                type="button"
                variant="ghost"
                className={cn(
                  "h-auto w-full justify-start rounded-md px-2 py-1.5 text-left text-footnote font-semibold text-label-secondary hover:bg-accent/60 hover:text-label-primary",
                  getHeadingIndent(item.depth),
                )}
                onClick={(event) => buttonProps.onClick(event, item, "smooth")}
              >
                <span className="block w-full truncate">{item.title}</span>
              </Button>
            ))
          ) : (
            <div>{t("CONTENT_LIBRARY_EDITOR_TOC_EMPTY")}</div>
          )}
        </div>
      </div>
      {props.children}
    </PlateElement>
  );
}
