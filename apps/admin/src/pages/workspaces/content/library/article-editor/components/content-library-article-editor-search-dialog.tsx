import * as React from "react";

import { useTranslation } from "react-i18next";

import { notifyErrorText, notifyInfoText } from "@/lib/notifications";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingDialog } from "@arclayer/ui/setting-dialog";

function runBrowserFind(query: string, backward = false) {
  const finder = (
    window as Window & {
      find?: (
        query: string,
        caseSensitive?: boolean,
        backwards?: boolean,
        wrapAround?: boolean,
        wholeWord?: boolean,
        searchInFrames?: boolean,
        showDialog?: boolean,
      ) => boolean;
    }
  ).find;
  if (typeof window === "undefined" || typeof finder !== "function") {
    throw new Error("ARTICLE_EDITOR_BROWSER_FIND_UNAVAILABLE");
  }
  return finder(query, false, backward, true, false, false, false);
}

export function ContentLibraryArticleEditorSearchDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(["content", "common"]);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    if (!props.open) return;
    setQuery("");
  }, [props.open]);

  const handleFind = React.useCallback(
    (backward = false) => {
      const nextQuery = query.trim();
      if (!nextQuery) return;
      try {
        const found = runBrowserFind(nextQuery, backward);
        if (!found) {
          notifyInfoText(t("CONTENT_LIBRARY_EDITOR_SEARCH_NO_RESULTS"));
        }
      } catch (error) {
        notifyErrorText(
          error instanceof Error ? error.message : t("CONTENT_LIBRARY_EDITOR_SEARCH_FAILED"),
        );
      }
    },
    [query, t],
  );

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("CONTENT_LIBRARY_EDITOR_SEARCH_DIALOG_TITLE")}
      description={t("CONTENT_LIBRARY_EDITOR_SEARCH_DIALOG_DESC")}
      contentClassName="sm:max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>
            {t("common:CANCEL")}
          </Button>
          <Button variant="outline" disabled={!query.trim()} onClick={() => handleFind(true)}>
            {t("CONTENT_LIBRARY_EDITOR_SEARCH_PREVIOUS")}
          </Button>
          <Button disabled={!query.trim()} onClick={() => handleFind(false)}>
            {t("CONTENT_LIBRARY_EDITOR_SEARCH_NEXT")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 py-2">
        <div className="grid gap-1.5">
          <label className="font-semibold text-label-primary" htmlFor="article-editor-search-query">
            {t("CONTENT_LIBRARY_EDITOR_SEARCH_LABEL")}
          </label>
          <div className="text-label-secondary">{t("CONTENT_LIBRARY_EDITOR_SEARCH_HINT")}</div>
          <Input
            id="article-editor-search-query"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || !query.trim()) return;
              event.preventDefault();
              handleFind(event.shiftKey);
            }}
          />
        </div>
      </div>
    </SettingDialog>
  );
}
