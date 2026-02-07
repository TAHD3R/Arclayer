import { Button, Divider, Space } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { usePreferencesStore } from "@/stores/use-preference-store";
import { listSSOProviders } from "@/api/auth-sso";
import GoogleIcon from "@/components/ui/icons/google-icon";
import GitHubDarkIcon from "@/components/ui/icons/github-dark-icon";
import GitHubLightIcon from "@/components/ui/icons/github-light-icon";

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
    startUrl: String(p.start_url || ""),
  }));

  const google = normalized.find((p) => p.provider === "google");
  const github = normalized.find((p) => p.provider === "github");

  if (!google && !github) return null;

  return (
    <>
      <Divider style={{ margin: "18px 0" }}>{t("auth:OAUTH_DIVIDER")}</Divider>
      <Space orientation="vertical" size={10} style={{ width: "100%" }}>
        {google ? (
          <Button
            block
            size="large"
            icon={<GoogleIcon size={14} />}
            disabled={disabled || providersQuery.isLoading}
            aria-label={t("auth:OAUTH_GOOGLE")}
            onClick={() => {
              if (!google.startUrl) return;
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
              if (!github.startUrl) return;
              window.location.assign(github.startUrl);
            }}
          >
            {t("auth:OAUTH_GITHUB")}
          </Button>
        ) : null}
      </Space>
    </>
  );
}
