import {
  ExternalLink,
  Languages,
  Monitor,
  MonitorSmartphone,
  Moon,
  ShieldCheck,
  Sun,
  Trash2,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  getCurrentMfaReadiness,
  getCurrentPlatformActorProfile,
  getCurrentPlatformTeamIdentity,
  getCurrentSessions,
  updateCurrentPlatformActorProfile,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getProductApplicationUrl } from "@/lib/origins";
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
  onProfileUpdated,
  onSessionEnded,
  open,
}: Readonly<{
  onOpenChange: (open: boolean) => void;
  onProfileUpdated: () => void | Promise<void>;
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
      <DialogContent className="flex h-[min(46rem,calc(100vh-2rem))] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogHeader className="shrink-0 border-b px-6 py-5 pr-14">
          <DialogTitle>{t("access:ACCOUNT_SETTINGS_TITLE")}</DialogTitle>
          <DialogDescription>{t("access:ACCOUNT_SETTINGS_DESCRIPTION")}</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 min-w-0 flex-1 md:grid-cols-[13rem_minmax(0,1fr)]">
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
          <main className="min-h-0 min-w-0 overflow-y-auto p-5 sm:p-6">
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
                  onProfileUpdated={onProfileUpdated}
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
  onProfileUpdated,
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
  onProfileUpdated: () => void | Promise<void>;
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
  return <ProfileSettings data={data} onProfileUpdated={onProfileUpdated} onRefresh={onRefresh} />;
}

function ProfileSettings({
  data,
  onProfileUpdated,
  onRefresh,
}: Readonly<{
  data: {
    identity: Awaited<ReturnType<typeof getCurrentPlatformTeamIdentity>>;
    profile: Awaited<ReturnType<typeof getCurrentPlatformActorProfile>>;
  };
  onProfileUpdated: () => void | Promise<void>;
  onRefresh: () => void;
}>) {
  const { t } = useTranslation("access");
  const [displayName, setDisplayName] = useState(data.profile.displayName ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setDisplayName(data.profile.displayName ?? "");
  }, [data.profile.displayName]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(false);
    try {
      await updateCurrentPlatformActorProfile({ displayName: displayName.trim() || null });
      toast.success(t("ACCOUNT_PROFILE_UPDATED"));
      onRefresh();
      await onProfileUpdated();
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>{t("ACCOUNT_PROFILE_TITLE")}</CardTitle>
          <CardDescription>{t("ACCOUNT_PROFILE_DESCRIPTION")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={save}>
            <div className="space-y-2">
              <Label htmlFor="platform-display-name">{t("ACCOUNT_PROFILE_DISPLAY_NAME")}</Label>
              <Input
                id="platform-display-name"
                maxLength={64}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder={t("ACCOUNT_PROFILE_DISPLAY_NAME_PLACEHOLDER")}
                value={displayName}
              />
              <p className="text-sm text-muted-foreground">{t("ACCOUNT_PROFILE_NAME_HELP")}</p>
            </div>
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
            {error ? (
              <p className="text-sm text-destructive">{t("ACCOUNT_PROFILE_UPDATE_ERROR")}</p>
            ) : null}
            <Button
              disabled={(data.profile.displayName ?? "") === displayName.trim()}
              loading={pending}
              type="submit"
            >
              {t("ACCOUNT_PROFILE_SAVE")}
            </Button>
          </form>
          <Separator className="my-5" />
          <div>
            <p className="text-sm text-muted-foreground">{t("ACCOUNT_PROFILE_AUTHORITY")}</p>
            <p className="mt-1 font-medium">
              {t(
                data.identity.isInstanceOwner
                  ? "ACCOUNT_AUTHORITY_OWNER"
                  : "ACCOUNT_AUTHORITY_TEAM_MEMBER",
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
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Trash2 aria-hidden="true" className="size-5" />
            {t("ACCOUNT_DELETE_TITLE")}
          </CardTitle>
          <CardDescription>
            {t(
              data.identity.isInstanceOwner
                ? "ACCOUNT_DELETE_OWNER_DESCRIPTION"
                : "ACCOUNT_DELETE_MEMBER_DESCRIPTION",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="destructive">
            <a href={getProductApplicationUrl("account-danger")}>
              {t("ACCOUNT_DELETE_MANAGE")}
              <ExternalLink aria-hidden="true" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PreferencesSettings() {
  const { t } = useTranslation(["access", "common"]);
  const { languages, locale, setLocale, setTheme, theme } = usePlatformPreferences();
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>{t("access:ACCOUNT_LANGUAGE_TITLE")}</CardTitle>
          <CardDescription>{t("access:ACCOUNT_LANGUAGE_DESCRIPTION")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {languages
            .filter((language) => language.enabled)
            .map((language) => (
              <Button
                key={language.locale}
                onClick={() => setLocale(language.locale)}
                variant={locale === language.locale ? "default" : "outline"}
              >
                <span
                  className={`fi fi-${language.flag_code} rounded-sm ring-1 ring-border`}
                  aria-hidden="true"
                  role="img"
                />
                {language.native_name}
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
