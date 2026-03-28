"use client";

import * as React from "react";

import { Link2 } from "lucide-react";
import { unwrapLink, upsertLink } from "@platejs/link";
import { useEditorRef } from "platejs/react";
import { useTranslation } from "react-i18next";

import { ToolbarButton } from "@/components/ui/toolbar";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";

export function LinkToolbarButton(props: { variant?: "default" | "outline" }) {
  const { t } = useTranslation(["content", "common"]);
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);
  const [url, setUrl] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    const linkEntry = editor.api.above({
      match: { type: "a" },
    });
    const linkNode = linkEntry?.[0] as { url?: string } | undefined;
    setUrl(typeof linkNode?.url === "string" ? linkNode.url : "");
  }, [editor, open]);

  const apply = React.useCallback(() => {
    if (!url.trim()) return;
    upsertLink(editor, {
      target: "_blank",
      url: url.trim(),
    });
    setOpen(false);
  }, [editor, url]);

  const remove = React.useCallback(() => {
    unwrapLink(editor);
    setOpen(false);
  }, [editor]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ToolbarButton
          aria-label={t("CONTENT_LIBRARY_EDITOR_MARK_LINK")}
          tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_LINK")}
          variant={props.variant ?? "outline"}
        >
          <Link2 />
        </ToolbarButton>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={10}
        className="w-80 rounded-2xl border border-border/70 p-3 shadow-xl"
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-callout font-medium text-label-primary">
              {t("CONTENT_LIBRARY_EDITOR_MARK_LINK")}
            </div>
            <div className="text-footnote text-label-secondary">
              {t("CONTENT_LIBRARY_EDITOR_LINK_HELP")}
            </div>
          </div>
          <Input
            autoFocus
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://"
            className="h-9"
          />
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={remove}>
              {t("CONTENT_LIBRARY_EDITOR_LINK_REMOVE")}
            </Button>
            <Button type="button" size="sm" disabled={!url.trim()} onClick={apply}>
              {t("common:CONFIRM")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
