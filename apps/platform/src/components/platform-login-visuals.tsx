import { Languages, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { PlatformAurora } from "@/components/platform-aurora";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { usePlatformPreferences, type ThemePreference } from "@/lib/preferences";

const AURORA_COLOR_STOPS = {
  light: ["#238bff", "#8ba4c7", "#238bff"],
  dark: ["#339cff", "#526477", "#339cff"],
} satisfies Record<"light" | "dark", [string, string, string]>;

function useResolvedPlatformTheme(theme: ThemePreference): "light" | "dark" {
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [theme]);

  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}

export function PlatformLoginBackground() {
  const { theme } = usePlatformPreferences();
  const resolvedTheme = useResolvedPlatformTheme(theme);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      data-testid="platform-login-background"
    >
      <div className="h-1/2 w-full opacity-30 [mask-image:linear-gradient(to_bottom,black,transparent)]">
        <PlatformAurora
          amplitude={0.8}
          blend={0.75}
          colorStops={AURORA_COLOR_STOPS[resolvedTheme]}
          luminanceLift={resolvedTheme === "light" ? 1 : 0}
          speed={0.35}
        />
      </div>
    </div>
  );
}

export function PlatformLoginLogo() {
  const { theme } = usePlatformPreferences();
  const resolvedTheme = useResolvedPlatformTheme(theme);
  return (
    <img
      alt="Arclayer"
      className="block h-auto w-[132px] max-w-full object-contain"
      height={39}
      src={resolvedTheme === "dark" ? "/logo-full-dark.svg" : "/logo-full.svg"}
      width={132}
    />
  );
}

export function PlatformLoginPreferences() {
  const { t } = useTranslation("common");
  const { locale, setLocale, setTheme, theme } = usePlatformPreferences();
  const resolvedTheme = useResolvedPlatformTheme(theme);
  const ThemeIcon = resolvedTheme === "dark" ? Moon : Sun;

  return (
    <div className="flex items-center justify-center gap-1 text-muted-foreground">
      <Button
        aria-label={t("CHANGE_LANGUAGE")}
        onClick={() => setLocale(locale === "zh-CN" ? "en-US" : "zh-CN")}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Languages aria-hidden="true" />
        {t(locale === "zh-CN" ? "LANGUAGE_ZH_CN" : "LANGUAGE_EN_US")}
      </Button>
      <Separator className="data-[orientation=vertical]:h-4" orientation="vertical" />
      <Button
        aria-label={t("THEME")}
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        size="sm"
        type="button"
        variant="ghost"
      >
        <ThemeIcon aria-hidden="true" />
        {t(resolvedTheme === "dark" ? "THEME_DARK" : "THEME_LIGHT")}
      </Button>
    </div>
  );
}
