import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";

import { toggleThemeModeWithTransition } from "@/components/ui/theme-transition";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { Button } from "@arclayer/ui/button";

export function AdminThemeModeToggle(props: { className?: string }) {
  const mode = usePreferencesStore((s) => s.themeMode);
  const { t } = useTranslation();
  const isDark = mode === "dark";

  return (
    <Button
      aria-label={isDark ? t("auth:THEME_TO_LIGHT") : t("auth:THEME_TO_DARK")}
      variant="ghost"
      size="icon-lg"
      className={props.className}
      onClick={() => {
        void toggleThemeModeWithTransition({ direction: "ltr" });
      }}
    >
      {isDark ? (
        <Sun size={18} className="text-current" />
      ) : (
        <Moon size={18} className="text-current" />
      )}
    </Button>
  );
}
