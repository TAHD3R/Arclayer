import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Languages,
  LoaderCircle,
  LogOut,
  Monitor,
  Moon,
  RefreshCw,
  Sun,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { getCurrentPlatformActorProfile, PlatformAccessApiError } from "@/access/access-api";
import { usePlatformAuth } from "@/auth/platform-auth";
import { getPlatformAppConfig } from "@/lib/app-config";
import { usePlatformPreferences, type ThemePreference } from "@/lib/preferences";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; icon: typeof Sun }> = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
];

type CurrentActorProfile = Awaited<ReturnType<typeof getCurrentPlatformActorProfile>>;
type CurrentActorProfileState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "error"; error: unknown }>
  | Readonly<{ status: "success"; profile: CurrentActorProfile }>;

function resolveAvatarUrl(avatarUrl: string | null | undefined): string | undefined {
  if (!avatarUrl) return undefined;
  return new URL(avatarUrl, getPlatformAppConfig().apiBaseUrl || window.location.origin).toString();
}

function avatarFallback(username: string): string {
  return Array.from(username.trim()).slice(0, 2).join("").toUpperCase();
}

function ProfileSummary({ state }: Readonly<{ state: CurrentActorProfileState }>) {
  const { t } = useTranslation("common");

  if (state.status === "loading") {
    return (
      <>
        <span className="size-8 shrink-0 animate-pulse rounded-lg bg-muted" />
        <span className="grid min-w-0 flex-1 gap-1">
          <span className="h-3 w-24 animate-pulse rounded bg-muted" />
          <span className="h-3 w-32 animate-pulse rounded bg-muted" />
        </span>
      </>
    );
  }

  if (state.status === "error") {
    return (
      <>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <AlertTriangle aria-hidden="true" className="size-4" />
        </span>
        <span className="grid min-w-0 flex-1 text-left leading-tight">
          <span className="truncate text-sm font-medium">{t("PROFILE_ERROR")}</span>
          <span className="truncate text-xs text-muted-foreground">{t("PROFILE_RETRY")}</span>
        </span>
      </>
    );
  }

  const { profile } = state;
  const avatarUrl = resolveAvatarUrl(profile.avatarUrl);
  return (
    <>
      <Avatar className="size-8 rounded-lg">
        <AvatarImage alt={profile.username} src={avatarUrl} />
        <AvatarFallback className="rounded-lg">{avatarFallback(profile.username)}</AvatarFallback>
      </Avatar>
      <span className="grid min-w-0 flex-1 text-left leading-tight">
        <span className="truncate text-sm font-semibold">{profile.username}</span>
        <span className="truncate text-xs">{profile.email ?? t("EMAIL_NOT_SET")}</span>
      </span>
    </>
  );
}

function SignOutError({ error }: Readonly<{ error: unknown }>) {
  const { t } = useTranslation("access");
  const code =
    error instanceof PlatformAccessApiError ? error.message : "PLATFORM_SESSION_SIGN_OUT_FAILED";

  return (
    <Alert variant="destructive">
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>{t("SIGN_OUT_ERROR")}</AlertTitle>
      <AlertDescription>
        <p>{t("SIGN_OUT_UNCHANGED")}</p>
        <p className="font-mono text-xs">{code}</p>
      </AlertDescription>
    </Alert>
  );
}

function PlatformSignOutDialog(props: {
  error: unknown;
  onConfirm: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending: boolean;
}) {
  const { t } = useTranslation("access");

  return (
    <AlertDialog onOpenChange={props.onOpenChange} open={props.open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("SIGN_OUT_TITLE")}</AlertDialogTitle>
          <AlertDialogDescription>{t("SIGN_OUT_DESCRIPTION")}</AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-sm text-muted-foreground">{t("SIGN_OUT_CONSEQUENCE")}</p>
        {props.error ? <SignOutError error={props.error} /> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={props.pending}>{t("CANCEL")}</AlertDialogCancel>
          <Button
            disabled={props.pending}
            onClick={() => void props.onConfirm()}
            variant="destructive"
          >
            {props.pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
            {t("CONFIRM_SIGN_OUT")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function PlatformUserMenu() {
  const { t } = useTranslation(["common", "access"]);
  const { isMobile } = useSidebar();
  const { locale, setLocale, setTheme, theme } = usePlatformPreferences();
  const { session, signOut } = usePlatformAuth();
  const navigate = useNavigate();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [profileState, setProfileState] = useState<CurrentActorProfileState>({
    status: "loading",
  });

  const CurrentThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  const loadProfile = useCallback(async () => {
    setProfileState({ status: "loading" });
    try {
      setProfileState({ status: "success", profile: await getCurrentPlatformActorProfile() });
    } catch (caught) {
      setProfileState({ status: "error", error: caught });
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  if (!session) {
    throw new Error("PlatformUserMenu requires an authenticated Platform Session");
  }

  const confirmSignOut = async () => {
    setPending(true);
    setError(null);
    try {
      await signOut();
      setSignOutOpen(false);
      void navigate({ to: "/sign-in", replace: true });
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                aria-label={t("common:USER_MENU")}
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                size="lg"
                tooltip={t("common:USER_MENU")}
              >
                <ProfileSummary state={profileState} />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left">
                  <ProfileSummary state={profileState} />
                </div>
              </DropdownMenuLabel>
              {profileState.status === "error" ? (
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    void loadProfile();
                  }}
                >
                  <RefreshCw aria-hidden="true" />
                  {t("common:PROFILE_RETRY")}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Languages aria-hidden="true" />
                    {t("common:CHANGE_LANGUAGE")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup
                      onValueChange={(value) => {
                        if (value !== "zh-CN" && value !== "en-US") {
                          throw new Error(`Unsupported Platform locale: ${value}`);
                        }
                        setLocale(value);
                      }}
                      value={locale}
                    >
                      <DropdownMenuRadioItem value="zh-CN">
                        {t("common:LANGUAGE_ZH_CN")}
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="en-US">
                        {t("common:LANGUAGE_EN_US")}
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <CurrentThemeIcon aria-hidden="true" className="size-4" />
                    {t("common:THEME")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup
                      onValueChange={(value) => {
                        if (value !== "light" && value !== "dark" && value !== "system") {
                          throw new Error(`Unsupported Platform theme: ${value}`);
                        }
                        setTheme(value);
                      }}
                      value={theme}
                    >
                      {THEME_OPTIONS.map((option) => {
                        const Icon = option.icon;
                        const labelKey =
                          option.value === "system"
                            ? "common:THEME_SYSTEM"
                            : `common:THEME_${option.value.toUpperCase()}`;
                        return (
                          <DropdownMenuRadioItem
                            className="gap-2"
                            key={option.value}
                            value={option.value}
                          >
                            <Icon aria-hidden="true" className="size-4 shrink-0" />
                            {t(labelKey)}
                          </DropdownMenuRadioItem>
                        );
                      })}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => {
                  setError(null);
                  setSignOutOpen(true);
                }}
              >
                <LogOut aria-hidden="true" />
                {t("access:SIGN_OUT")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      <PlatformSignOutDialog
        error={error}
        onConfirm={confirmSignOut}
        onOpenChange={(open) => !pending && setSignOutOpen(open)}
        open={signOutOpen}
        pending={pending}
      />
    </>
  );
}
