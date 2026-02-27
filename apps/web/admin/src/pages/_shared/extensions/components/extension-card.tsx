import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Tag } from "antd";

import { ExtensionIcon } from "./extension-icon";
import { cn } from "@/lib/utils";

import type { InstalledExtensionItem } from "../types";

type ExtensionCardProps = {
  extension: InstalledExtensionItem;
  href: string | null;
  installed?: boolean;
  actions?: ReactNode;
  className?: string;
};

export function ExtensionCard({
  extension,
  href,
  installed,
  actions,
  className,
}: ExtensionCardProps) {
  const { t } = useTranslation(["plugin"]);

  const category = String(extension.category || "").trim();
  const categoryLabel = category
    ? t(`plugin:PLUGIN_CATEGORY_${category.toUpperCase()}`, { defaultValue: category })
    : null;

  const content = (
    <>
      <div className="mb-4 flex flex-col">
        <div className="flex flex-row justify-between">
          <div className="mb-4 mr-4">
            <ExtensionIcon
              name={extension.name}
              iconUrl={extension.iconUrl}
              size={40}
              className="rounded-sm"
              fallbackIconClassName="size-5"
            />
          </div>
          <div className="flex items-start gap-1.5">
            {installed ? <Tag color="green">{t("plugin:EXTENSION_CARD_INSTALLED")}</Tag> : null}
            {actions ? (
              <div className="shrink-0" onClick={(e) => e.preventDefault()}>
                {actions}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col wrap-break-word" style={{ overflowWrap: "anywhere" }}>
          <div className="text-headline text-label-primary">{extension.name}</div>
          {"author" in extension && extension.author ? (
            <div className="flex flex-row items-center text-footnote text-label-secondary">
              {t("plugin:EXTENSION_CARD_DEVELOPED_BY")}
              <span className="ml-1 font-medium">{String(extension.author)}</span>
            </div>
          ) : null}
        </div>
      </div>

      {extension.description ? (
        <p className="text-footnote text-label-secondary line-clamp-3">{extension.description}</p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {categoryLabel ? <Tag>{categoryLabel}</Tag> : null}
        <Tag>{t("plugin:EXTENSION_CARD_VERSION", { version: extension.version })}</Tag>
      </div>
    </>
  );

  const sharedClassName = cn(
    "col-span-1 flex flex-col rounded-lg border border-border bg-accent/50! p-4 shadow-sm!",
    "text-foreground no-underline transition-all! duration-200!",
    "hover:-translate-y-0.5! hover:shadow-md! hover:border-border/80! hover:bg-card!",
    "focus-within:z-[1] active:z-[1]",
    className,
  );

  if (href) {
    return (
      <Link to={href} className={sharedClassName} aria-label={extension.name}>
        {content}
      </Link>
    );
  }

  return (
    <div className={sharedClassName} aria-label={extension.name}>
      {content}
    </div>
  );
}
