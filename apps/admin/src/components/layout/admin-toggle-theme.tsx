import { Button } from "antd";
import { useTranslation } from "react-i18next";
import { useState } from "react";

import { toggleThemeModeWithTransition } from "@/components/ui/theme-transition";
import { usePreferencesStore } from "@/stores/use-preference-store";
import MoonIcon from "@celestial/ui/icons/moon-icon";
import SunIcon from "@celestial/ui/icons/sun-icon";

export function AdminThemeModeToggle(props: { className?: string }) {
  const mode = usePreferencesStore((s) => s.themeMode);
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);

  const isDark = mode === "dark";

  return (
    <Button
      aria-label={isDark ? t("auth:THEME_TO_LIGHT") : t("auth:THEME_TO_DARK")}
      type="text"
      size="large"
      className={props.className}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => {
        void toggleThemeModeWithTransition({ direction: "ltr" });
      }}
      icon={
        isDark ? (
          <SunIcon size={18} isHovered={hovered} className="text-current" />
        ) : (
          <MoonIcon size={18} isHovered={hovered} className="text-current" />
        )
      }
    />
  );
}
