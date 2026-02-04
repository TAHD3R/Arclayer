import { Button, Space } from "antd";
import { useTranslation } from "react-i18next";

import { usePreferencesStore } from "@/stores/use-preference-store";
import GoogleIcon from "@/components/ui/icons/google-icon";
import GitHubDarkIcon from "@/components/ui/icons/github-dark-icon";
import GitHubLightIcon from "@/components/ui/icons/github-light-icon";

export interface AuthOauthButtonsProps {
  disabled?: boolean;
}

export function AuthOauthButtons({ disabled = true }: AuthOauthButtonsProps) {
  const { t } = useTranslation();
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const isDark = themeMode === "dark";

  const GitHubIcon = isDark ? GitHubDarkIcon : GitHubLightIcon;

  return (
    <Space orientation="vertical" size={10} style={{ width: "100%" }}>
      <Button
        block
        size="large"
        icon={<GoogleIcon size={14} />}
        disabled={disabled}
        aria-label={t("auth:OAUTH_GOOGLE")}
      >
        {t("auth:OAUTH_GOOGLE")}
      </Button>

      <Button
        block
        size="large"
        icon={<GitHubIcon size={14} />}
        disabled={disabled}
        aria-label={t("auth:OAUTH_GITHUB")}
      >
        {t("auth:OAUTH_GITHUB")}
      </Button>
    </Space>
  );
}
