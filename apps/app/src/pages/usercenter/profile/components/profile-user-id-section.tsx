import { Copy } from "lucide-react";
import { useTranslation } from "react-i18next";

import { copyToClipboard } from "@/lib/clipboard";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { Button } from "@arclayer/ui/button";

export type UserProfileUserIdSectionProps = {
  userId: string | null;
};

export function UserProfileUserIdSection(props: UserProfileUserIdSectionProps) {
  const { t } = useTranslation(["account"]);
  const hasUserId = Boolean(props.userId);

  const handleCopy = async () => {
    if (!props.userId) return;
    try {
      await copyToClipboard(props.userId);
      notifySuccessText(t("account:ME_PROFILE_USER_ID_COPIED"));
    } catch (error) {
      notifyError(error);
    }
  };

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-body font-medium text-label-primary">
          {t("account:ME_PROFILE_USER_ID_TITLE")}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <code className="max-w-[20rem] truncate font-mono text-callout text-label-secondary">
          {props.userId ?? "-"}
        </code>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={!hasUserId}
          aria-label={t("account:ME_PROFILE_USER_ID_COPY")}
          onClick={() => void handleCopy()}
        >
          <Copy className="size-4" />
        </Button>
      </div>
    </div>
  );
}
