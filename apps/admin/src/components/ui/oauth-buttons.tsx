import { Button, Divider } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { usePreferencesStore } from "@/stores/use-preference-store";
import { listSSOProviders } from "@/api/auth-sso";
import GoogleIcon from "@celestial/ui/icons/google-icon";
import GitHubDarkIcon from "@celestial/ui/icons/github-dark-icon";
import GitHubLightIcon from "@celestial/ui/icons/github-light-icon";
import { notifyErrorText } from "@/lib/notifications";

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
    meta: { silent: true },
  });

  const providers = providersQuery.data?.providers ?? [];
  const normalized = providers.map((p) => ({
    provider: normalizeProvider(p.provider),
    startUrl: String(p.startUrl || p.start_url || ""),
  }));

  const google = normalized.find((p) => p.provider === "google");
  const github = normalized.find((p) => p.provider === "github");

  if (!google && !github) return null;

  return (
    <>
      <div className="flex flex-col gap-2.5">
        {google ? (
          <Button
            block
            size="large"
            icon={<GoogleIcon size={14} />}
            disabled={disabled || providersQuery.isLoading}
            aria-label={t("auth:OAUTH_GOOGLE")}
            onClick={() => {
              if (!google.startUrl) {
                notifyErrorText(t("auth:OAUTH_ERROR_GENERIC"));
                return;
              }
              window.location.assign(google.startUrl);
            }}
          >
            {t("auth:OAUTH_GOOGLE")}
          </Button>
        ) : null}

        {github ? (
          <Button
            block
            size="large"
            icon={<GitHubIcon size={14} />}
            disabled={disabled || providersQuery.isLoading}
            aria-label={t("auth:OAUTH_GITHUB")}
            onClick={() => {
              if (!github.startUrl) {
                notifyErrorText(t("auth:OAUTH_ERROR_GENERIC"));
                return;
              }
              window.location.assign(github.startUrl);
            }}
          >
            {t("auth:OAUTH_GITHUB")}
          </Button>
        ) : null}
      </div>
      <Divider style={{ margin: "24px 0" }}>{t("auth:OAUTH_ACCOUNT_DIVIDER")}</Divider>
    </>
  );
}
