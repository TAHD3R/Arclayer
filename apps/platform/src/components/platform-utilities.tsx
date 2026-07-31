import { useNavigate } from "@tanstack/react-router";
import { ExternalLink, Languages, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";

import { usePlatformAuth } from "@/auth/platform-auth";
import { getProductApplicationUrl } from "@/lib/origins";
import { usePlatformPreferences, type ThemePreference } from "@/lib/preferences";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; icon: typeof Sun }> = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
];

export function ProductApplicationLink() {
  const { t } = useTranslation("common");
  return (
    <Button asChild variant="ghost" size="sm">
      <a aria-label={t("RETURN_TO_PRODUCT")} href={getProductApplicationUrl("home")}>
        <ExternalLink aria-hidden="true" />
        <span className="hidden lg:inline">{t("RETURN_TO_PRODUCT")}</span>
      </a>
    </Button>
  );
}

export function LocaleMenu() {
  const { t } = useTranslation("common");
  const { locale, setLocale } = usePlatformPreferences();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label={t("CHANGE_LANGUAGE")} variant="ghost" size="icon-sm">
          <Languages aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("CHANGE_LANGUAGE")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={(value) => {
            if (value !== "zh-CN" && value !== "en-US") {
              throw new Error(`Unsupported Platform locale: ${value}`);
            }
            setLocale(value);
          }}
        >
          <DropdownMenuRadioItem value="zh-CN">{t("LANGUAGE_ZH_CN")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en-US">{t("LANGUAGE_EN_US")}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ThemeMenu() {
  const { t } = useTranslation("common");
  const { theme, setTheme } = usePlatformPreferences();
  const CurrentThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label={t("THEME")} variant="ghost" size="icon-sm">
          <CurrentThemeIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("THEME")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            if (value !== "light" && value !== "dark" && value !== "system") {
              throw new Error(`Unsupported Platform theme: ${value}`);
            }
            setTheme(value);
          }}
        >
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                <Icon aria-hidden="true" />
                {t(`THEME_${option.value === "system" ? "SYSTEM" : option.value.toUpperCase()}`)}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SignOutButton() {
  const { t } = useTranslation("access");
  const { signOut } = usePlatformAuth();
  const navigate = useNavigate();
  return (
    <Button
      aria-label={t("SIGN_OUT")}
      onClick={() => {
        signOut();
        void navigate({ to: "/sign-in", replace: true });
      }}
      size="icon-sm"
      variant="ghost"
    >
      <LogOut aria-hidden="true" />
    </Button>
  );
}
