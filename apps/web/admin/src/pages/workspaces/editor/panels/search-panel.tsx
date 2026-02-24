import { useTranslation } from "react-i18next";
import { Input } from "antd";
import { Search } from "lucide-react";

export function SearchPanel() {
  const { t } = useTranslation(["content_pages"]);

  return (
    <div className="flex flex-col gap-2 p-2">
      <Input
        size="small"
        prefix={<Search className="size-3.5 text-muted-foreground" />}
        placeholder={t("content_pages:EDITOR_V2_SEARCH_PLACEHOLDER", {
          defaultValue: "Search blocks, pages, assets...",
        })}
        allowClear
      />
      <p className="text-center text-xs text-muted-foreground">
        {t("content_pages:EDITOR_V2_SEARCH_HINT", {
          defaultValue: "Type to search across the editor",
        })}
      </p>
    </div>
  );
}
