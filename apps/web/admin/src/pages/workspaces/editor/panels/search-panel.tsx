import { useTranslation } from "react-i18next";

export function SearchPanel() {
  const { t } = useTranslation(["content_pages"]);

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <span className="text-caption text-label-secondary">
        {t("content_pages:EDITOR_COMING_SOON")}
      </span>
    </div>
  );
}
