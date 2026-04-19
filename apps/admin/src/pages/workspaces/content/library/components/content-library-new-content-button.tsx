import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";

export function ContentLibraryNewContentButton(props: {
  onClick: () => void;
  visible?: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation("content");
  if (props.visible === false) return null;

  return (
    <Button size="lg" onClick={props.onClick} disabled={props.disabled}>
      <Plus className="size-4" aria-hidden="true" />
      {t("CONTENT_LIBRARY_ACTION_NEW_CONTENT")}
    </Button>
  );
}
