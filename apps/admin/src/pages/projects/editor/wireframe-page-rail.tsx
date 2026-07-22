import { cn } from "@arclayer/lib/utils";
import { ScrollArea } from "@arclayer/ui/scroll-area";
import type { BuilderRevisionPageOut } from "@arclayer/openapi";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";

export function WireframePageRail({
  pages,
  selectedPageId,
  onSelectPage,
}: {
  pages: BuilderRevisionPageOut[];
  selectedPageId: string | null;
  onSelectPage: (pageId: string) => void;
}) {
  const { t } = useTranslation("account");
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-background">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-footnote font-semibold text-label-primary">
          {t("CREATION_EDITOR_WIREFRAME_PAGES")}
        </h2>
        <p className="mt-0.5 text-caption text-label-secondary">
          {t("CREATION_EDITOR_WIREFRAME_PAGES_COUNT", { count: pages.length })}
        </p>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <ul className="space-y-1 p-2">
          {pages.map((page) => (
            <li key={page.itemId}>
              <button
                type="button"
                aria-pressed={selectedPageId === page.itemId}
                onClick={() => onSelectPage(page.itemId)}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none",
                  selectedPageId === page.itemId
                    ? "bg-primary/10 text-primary"
                    : "text-label-secondary hover:bg-muted hover:text-label-primary",
                )}
              >
                <FileText className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-footnote font-medium">
                  {page.title}
                </span>
                <span className="font-mono text-caption tabular-nums">
                  {page.wireframe?.sections?.length ?? 0}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </aside>
  );
}
