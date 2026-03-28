import * as React from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import {
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@arclayer/ui/dropdown-menu";
import { Input } from "@arclayer/ui/input";
import { cn } from "@arclayer/lib/utils";

type ContentLibraryArticleEditorMenuProps = {
  status: "draft" | "published" | "archived";
  visibility: "public" | "private";
  onVisibilityChange: (value: "public" | "private") => void;
  slug: string;
  onSlugChange: (value: string) => void;
};

function MenuSection(props: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-1.5", props.className)}>
      <div className="text-caption text-label-secondary">{props.label}</div>
      {props.children}
    </section>
  );
}

export function ContentLibraryArticleEditorMenu(props: ContentLibraryArticleEditorMenuProps) {
  const { t } = useTranslation("content");
  const statusKey = `CONTENT_LIBRARY_STATUS_${props.status.toUpperCase()}`;

  return (
    <DropdownMenuContent align="end" className="w-[360px]">
      <DropdownMenuLabel>{t("CONTENT_LIBRARY_EDITOR_DOCUMENT_MENU")}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <div className="space-y-4 px-2 py-2">
        <MenuSection label={t("CONTENT_LIBRARY_EDITOR_MENU_STATUS")}>
          <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-footnote text-foreground">
            {t(statusKey)}
          </div>
        </MenuSection>

        <MenuSection label={t("CONTENT_LIBRARY_EDITOR_MENU_VISIBILITY")}>
          <div role="radiogroup" className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              role="radio"
              aria-checked={props.visibility === "public"}
              variant={props.visibility === "public" ? "accent" : "outline"}
              size="sm"
              onClick={() => props.onVisibilityChange("public")}
            >
              {t("CONTENT_LIBRARY_VISIBILITY_PUBLIC")}
            </Button>
            <Button
              type="button"
              role="radio"
              aria-checked={props.visibility === "private"}
              variant={props.visibility === "private" ? "accent" : "outline"}
              size="sm"
              onClick={() => props.onVisibilityChange("private")}
            >
              {t("CONTENT_LIBRARY_VISIBILITY_PRIVATE")}
            </Button>
          </div>
        </MenuSection>

        <MenuSection label={t("CONTENT_LIBRARY_EDITOR_MENU_SLUG")}>
          <Input
            aria-label={t("CONTENT_LIBRARY_EDITOR_MENU_SLUG")}
            value={props.slug}
            onChange={(event) => props.onSlugChange(event.target.value)}
            className="h-8"
          />
        </MenuSection>
      </div>
    </DropdownMenuContent>
  );
}
