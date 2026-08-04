import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTranslation } from "react-i18next";

import { usePlatformPreferences } from "@/lib/preferences";

export function Toaster(props: ToasterProps) {
  const { theme } = usePlatformPreferences();
  const { t } = useTranslation("common");

  return (
    <Sonner
      closeButton
      containerAriaLabel={t("TOAST_NOTIFICATIONS")}
      position="top-right"
      theme={theme}
      toastOptions={{
        closeButtonAriaLabel: t("CLOSE"),
        classNames: {
          toast: "border-border bg-popover text-popover-foreground",
          description: "text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}
