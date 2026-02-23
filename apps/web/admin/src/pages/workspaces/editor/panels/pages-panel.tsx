import { useTranslation } from "react-i18next";

export function PagesPanel() {
  const { t } = useTranslation(["content_pages"]);

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <span className="text-xs text-muted-foreground">
        {t("content_pages:EDITOR_V2_PAGES_EMPTY", { defaultValue: "No pages yet" })}
      </span>
    </div>
  );
}
