import { Button } from "antd";
import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";

import { toggleThemeModeWithTransition } from "@/core/ui/theme-transition";
import { usePreferencesStore } from "@/stores/preferences.store";

export function AdminThemeModeToggle(props: { className?: string }) {
  const mode = usePreferencesStore((s) => s.themeMode);
  const { t } = useTranslation();

  const isDark = mode === "dark";

  return (
    <Button
      aria-label={isDark ? t("auth:THEME_TO_LIGHT") : t("auth:THEME_TO_DARK")}
      type="text"
      size="large"
      className={props.className}
      style={{ width: 44, height: 44, paddingInline: 0 }}
      onClick={() => {
        void toggleThemeModeWithTransition({ direction: "ltr" });
      }}
      icon={isDark ? <Sun size={18} /> : <Moon size={18} />}
    />
  );
}
