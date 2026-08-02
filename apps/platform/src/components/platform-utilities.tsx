import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ExternalLink, Languages, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { PlatformAccessApiError } from "@/access/access-api";
import { usePlatformAuth } from "@/auth/platform-auth";
import { getProductApplicationUrl } from "@/lib/origins";
import { usePlatformPreferences, type ThemePreference } from "@/lib/preferences";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { SettingDialog } from "@arclayer/ui/setting-dialog";

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
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const confirmSignOut = async () => {
    setPending(true);
    setError(null);
    try {
      await signOut();
      setOpen(false);
      void navigate({ to: "/sign-in", replace: true });
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <Button
        aria-label={t("SIGN_OUT")}
        onClick={() => setOpen(true)}
        size="icon-sm"
        variant="ghost"
      >
        <LogOut aria-hidden="true" />
      </Button>
      <SettingDialog
        description={t("SIGN_OUT_DESCRIPTION")}
        footer={
          <>
            <Button disabled={pending} onClick={() => setOpen(false)} variant="outline">
              {t("CANCEL")}
            </Button>
            <Button loading={pending} onClick={() => void confirmSignOut()} variant="destructive">
              {t("CONFIRM_SIGN_OUT")}
            </Button>
          </>
        }
        onOpenChange={(nextOpen) => !pending && setOpen(nextOpen)}
        open={open}
        title={t("SIGN_OUT_TITLE")}
      >
        <p className="text-body text-label-secondary">{t("SIGN_OUT_CONSEQUENCE")}</p>
        {error ? <SignOutError error={error} /> : null}
      </SettingDialog>
    </>
  );
}

function SignOutError({ error }: Readonly<{ error: unknown }>) {
  const { t } = useTranslation("access");
  const code =
    error instanceof PlatformAccessApiError ? error.message : "PLATFORM_SESSION_SIGN_OUT_FAILED";
  return (
    <Alert className="mt-4" variant="destructive">
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>{t("SIGN_OUT_ERROR")}</AlertTitle>
      <AlertDescription>
        <p>{t("SIGN_OUT_UNCHANGED")}</p>
        <p className="font-mono text-caption">{code}</p>
      </AlertDescription>
    </Alert>
  );
}
