import {
  Languages,
  Monitor,
  MonitorSmartphone,
  Moon,
  ShieldCheck,
  Sun,
  UserRound,
} from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  getCurrentMfaReadiness,
  getCurrentPlatformActorProfile,
  getCurrentPlatformTeamIdentity,
  getCurrentSessions,
} from "@/access/access-api";
import { AccessQueryState, useAccessQuery } from "@/access/access-ui";
import { PlatformMfaSettings } from "@/access/platform-mfa-settings";
import { PlatformAccountSessions } from "@/account/platform-account-sessions";
import { clearPlatformSession } from "@/auth/platform-session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { usePlatformPreferences, type ThemePreference } from "@/lib/preferences";
import { cn } from "@/lib/utils";

type SettingsSection = "profile" | "security" | "sessions" | "preferences";

const SECTIONS = [
  { id: "profile", icon: UserRound },
  { id: "security", icon: ShieldCheck },
  { id: "sessions", icon: MonitorSmartphone },
  { id: "preferences", icon: Languages },
] as const;

const THEMES: ReadonlyArray<{ value: ThemePreference; icon: typeof Sun }> = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
];

export function PlatformAccountSettings({
  onOpenChange,
  onSessionEnded,
  open,
}: Readonly<{
  onOpenChange: (open: boolean) => void;
  onSessionEnded: () => void;
  open: boolean;
}>) {
  const { t } = useTranslation(["access", "common"]);
  const [section, setSection] = useState<SettingsSection>("profile");
  const load = useCallback(async () => {
    const [profile, identity, mfa, sessions] = await Promise.all([
      getCurrentPlatformActorProfile(),
      getCurrentPlatformTeamIdentity(),
      getCurrentMfaReadiness(),
      getCurrentSessions(),
    ]);
    return { identity, mfa, profile, sessions };
  }, []);
  const { retry, state } = useAccessQuery(load, [open]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="h-[min(46rem,calc(100vh-2rem))] max-w-5xl gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogHeader className="border-b px-6 py-5 pr-14">
          <DialogTitle>{t("access:ACCOUNT_SETTINGS_TITLE")}</DialogTitle>
          <DialogDescription>{t("access:ACCOUNT_SETTINGS_DESCRIPTION")}</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 md:grid-cols-[13rem_minmax(0,1fr)]">
          <nav
            aria-label={t("access:ACCOUNT_SETTINGS_NAVIGATION")}
            className="flex gap-2 overflow-x-auto border-b bg-muted/40 p-3 md:flex-col md:border-b-0 md:border-r"
          >
            {SECTIONS.map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  className={cn("shrink-0 justify-start", section === item.id && "bg-accent")}
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  variant="ghost"
                >
                  <Icon aria-hidden="true" />
                  {t(`access:ACCOUNT_SETTINGS_${item.id.toUpperCase()}`)}
                </Button>
              );
            })}
          </nav>
          <main className="min-h-0 overflow-y-auto p-5 sm:p-6">
            <AccessQueryState isEmpty={() => false} retry={retry} state={state}>
              {(data) => (
                <SettingsSectionContent
                  data={data}
                  onCurrentSessionRevoked={() => {
                    clearPlatformSession("revoked");
                    onOpenChange(false);
                    onSessionEnded();
                  }}
                  onRefresh={retry}
                  section={section}
                />
              )}
            </AccessQueryState>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsSectionContent({
  data,
  onCurrentSessionRevoked,
  onRefresh,
  section,
}: Readonly<{
  data: Awaited<
    ReturnType<
      () => Promise<{
        identity: Awaited<ReturnType<typeof getCurrentPlatformTeamIdentity>>;
        mfa: Awaited<ReturnType<typeof getCurrentMfaReadiness>>;
        profile: Awaited<ReturnType<typeof getCurrentPlatformActorProfile>>;
        sessions: Awaited<ReturnType<typeof getCurrentSessions>>;
      }>
    >
  >;
  onCurrentSessionRevoked: () => void;
  onRefresh: () => void;
  section: SettingsSection;
}>) {
  const { t } = useTranslation("access");
  if (section === "security") {
    return <PlatformMfaSettings onChanged={onRefresh} readiness={data.mfa} />;
  }
  if (section === "sessions") {
    return (
      <PlatformAccountSessions
        onChanged={(messageKey) => {
          toast.success(t(messageKey));
          onRefresh();
        }}
        onCurrentSessionRevoked={onCurrentSessionRevoked}
        sessions={data.sessions}
      />
    );
  }
  if (section === "preferences") return <PreferencesSettings />;
  return <ProfileSettings data={data} />;
}

function ProfileSettings({
  data,
}: Readonly<{
  data: {
    identity: Awaited<ReturnType<typeof getCurrentPlatformTeamIdentity>>;
    profile: Awaited<ReturnType<typeof getCurrentPlatformActorProfile>>;
  };
}>) {
  const { t } = useTranslation("access");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("ACCOUNT_PROFILE_TITLE")}</CardTitle>
        <CardDescription>{t("ACCOUNT_PROFILE_DESCRIPTION")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted-foreground">{t("ACCOUNT_PROFILE_NAME")}</dt>
            <dd className="mt-1 font-medium">{data.profile.username}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">{t("ACCOUNT_PROFILE_EMAIL")}</dt>
            <dd className="mt-1 font-medium">
              {data.profile.email ?? t("ACCOUNT_PROFILE_EMAIL_EMPTY")}
            </dd>
          </div>
        </dl>
        <Separator />
        <div>
          <p className="text-sm text-muted-foreground">{t("ACCOUNT_PROFILE_AUTHORITY")}</p>
          <p className="mt-1 font-medium">
            {t(
              data.identity.isInstanceOwner
                ? "ACCOUNT_AUTHORITY_OWNER"
                : "ACCOUNT_AUTHORITY_OPERATOR",
            )}
          </p>
          {!data.identity.isInstanceOwner ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("ACCOUNT_PERMISSION_SUMMARY", {
                count: data.identity.effectivePermissions.length,
              })}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function PreferencesSettings() {
  const { t } = useTranslation(["access", "common"]);
  const { locale, setLocale, setTheme, theme } = usePlatformPreferences();
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>{t("access:ACCOUNT_LANGUAGE_TITLE")}</CardTitle>
          <CardDescription>{t("access:ACCOUNT_LANGUAGE_DESCRIPTION")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(["zh-CN", "en-US"] as const).map((value) => (
            <Button
              key={value}
              onClick={() => setLocale(value)}
              variant={locale === value ? "default" : "outline"}
            >
              {t(value === "zh-CN" ? "common:LANGUAGE_ZH_CN" : "common:LANGUAGE_EN_US")}
            </Button>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("access:ACCOUNT_THEME_TITLE")}</CardTitle>
          <CardDescription>{t("access:ACCOUNT_THEME_DESCRIPTION")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-3">
          {THEMES.map((option) => {
            const Icon = option.icon;
            return (
              <Button
                key={option.value}
                onClick={() => setTheme(option.value)}
                variant={theme === option.value ? "default" : "outline"}
              >
                <Icon aria-hidden="true" />
                {t(`common:THEME_${option.value.toUpperCase()}`)}
              </Button>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
