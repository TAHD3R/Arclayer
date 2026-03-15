import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { listSSOProviders } from "@/api/auth-sso";
import { notifyErrorText } from "@/lib/notifications";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { Button } from "@celestial/ui/button";
import GitHubDarkIcon from "@celestial/ui/icons/github-dark-icon";
import GitHubLightIcon from "@celestial/ui/icons/github-light-icon";
import GoogleIcon from "@celestial/ui/icons/google-icon";
import { Separator } from "@celestial/ui/separator";

export interface AuthOauthButtonsProps {
  disabled?: boolean;
  redirect?: string | undefined;
}

function normalizeProvider(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function AuthOauthButtons({ disabled = false, redirect }: AuthOauthButtonsProps) {
  const { t } = useTranslation();
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const isDark = themeMode === "dark";
  const GitHubIcon = isDark ? GitHubDarkIcon : GitHubLightIcon;

  const providersQuery = useQuery({
    queryKey: ["auth", "sso", "providers", redirect],
    queryFn: async () => listSSOProviders({ redirect }),
    staleTime: 15 * 1000,
    retry: false,
  });

  const providers = providersQuery.data?.providers ?? [];
  const normalized = providers.map((p) => ({
    provider: normalizeProvider(p.provider),
    startUrl: String(p.startUrl || p.start_url || ""),
  }));

  const google = normalized.find((p) => p.provider === "google");
  const github = normalized.find((p) => p.provider === "github");

  if (!google && !github) return null;

  const isBusy = disabled || providersQuery.isLoading;

  return (
    <>
      <div className="flex flex-col gap-2.5">
        {google ? (
          <Button
            className="w-full"
            variant="outline"
            size="lg"
            disabled={isBusy}
            aria-label={t("auth:OAUTH_GOOGLE")}
            onClick={() => {
              if (!google.startUrl) {
                notifyErrorText(t("auth:OAUTH_ERROR_GENERIC"));
                return;
              }
              window.location.assign(google.startUrl);
            }}
          >
            <GoogleIcon size={14} />
            {t("auth:OAUTH_GOOGLE")}
          </Button>
        ) : null}

        {github ? (
          <Button
            className="w-full"
            variant="outline"
            size="lg"
            disabled={isBusy}
            aria-label={t("auth:OAUTH_GITHUB")}
            onClick={() => {
              if (!github.startUrl) {
                notifyErrorText(t("auth:OAUTH_ERROR_GENERIC"));
                return;
              }
              window.location.assign(github.startUrl);
            }}
          >
            <GitHubIcon size={14} />
            {t("auth:OAUTH_GITHUB")}
          </Button>
        ) : null}
      </div>

      <div className="my-6 flex items-center gap-3 text-footnote text-label-secondary">
        <Separator className="flex-1" />
        <span>{t("auth:OAUTH_ACCOUNT_DIVIDER")}</span>
        <Separator className="flex-1" />
      </div>
    </>
  );
}
