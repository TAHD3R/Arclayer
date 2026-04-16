import { CircleHelp } from "lucide-react";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/layouts/page-shell/default-page";
import { UserNotificationSettingsView } from "@/pages/usercenter/notifications/components/user-notification-settings-view";
import { cn } from "@arclayer/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@arclayer/ui/tooltip";

export function UserCenterNotificationsPage() {
  const { t } = useTranslation("account");

  return (
    <DefaultPage
      title={
        <TooltipProvider>
          <div className="flex items-center gap-2">
            <span>{t("ME_TAB_NOTIFICATIONS")}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t("ME_TAB_NOTIFICATIONS_TOOLTIP")}
                  className={cn(
                    "inline-flex size-4 items-center justify-center rounded-full text-label-tertiary",
                    "transition-colors hover:text-label-secondary focus-visible:outline-none",
                    "focus-visible:ring-2 focus-visible:ring-primary/20",
                  )}
                >
                  <CircleHelp className="size-3.5" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-80 text-left">
                <div className="w-full text-left text-pretty">
                  {t("ME_TAB_NOTIFICATIONS_TOOLTIP")}
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      }
      description={t("ME_TAB_NOTIFICATIONS_DESC")}
      showFavoriteToggle={false}
    >
      <UserNotificationSettingsView mode="page" />
    </DefaultPage>
  );
}
