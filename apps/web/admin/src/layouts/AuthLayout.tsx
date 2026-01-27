import { Button, Dropdown, Space, Typography } from "antd";
import { type PropsWithChildren, useMemo } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Languages, Moon, Sun } from "lucide-react";
import { Icon } from "@iconify/react";

import ColorBends from "@/components/ui/ColorBends";
import { usePreferencesStore } from "@/stores/preferences.store";
import type { AppLocale } from "@/core/i18n";

function ThemeModeToggle() {
  const mode = usePreferencesStore((s) => s.themeMode);
  const toggle = usePreferencesStore((s) => s.toggleThemeMode);
  const { t } = useTranslation();

  const isDark = mode === "dark";

  return (
    <Button
      aria-label={isDark ? t("auth:THEME_TO_LIGHT") : t("auth:THEME_TO_DARK")}
      type="text"
      size="large"
      style={{ width: 44, height: 44, paddingInline: 0 }}
      onClick={toggle}
      icon={isDark ? <Sun size={18} /> : <Moon size={18} />}
    />
  );
}

function LocaleToggle() {
  const locale = usePreferencesStore((s) => s.locale);
  const setLocale = usePreferencesStore((s) => s.setLocale);
  const { t } = useTranslation();

  const items = useMemo(
    () => [
      {
        key: "zh-CN",
        label: (
          <Space size={10}>
            <Icon icon="twemoji:flag-china" width={18} height={18} />
            <span>简体中文</span>
          </Space>
        ),
      },
      {
        key: "en-US",
        label: (
          <Space size={10}>
            <Icon icon="twemoji:flag-united-states" width={18} height={18} />
            <span>English</span>
          </Space>
        ),
      },
    ],
    [],
  );

  return (
    <Dropdown
      menu={{
        items,
        selectable: true,
        selectedKeys: [locale],
        onClick: (info) => setLocale(info.key as AppLocale),
      }}
      trigger={["click"]}
    >
      <Button
        aria-label={t("auth:SWITCH_LANGUAGE")}
        type="text"
        size="large"
        style={{ width: 44, height: 44, paddingInline: 0 }}
        icon={<Languages size={18} />}
      />
    </Dropdown>
  );
}

export function AuthLayout({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const isDark = themeMode === "dark";

  const bendColors = ["#3b82f6"];

  return (
    <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-2">
      <div className="relative hidden lg:block">
        <ColorBends
          colors={bendColors}
          rotation={45}
          speed={0.2}
          scale={1}
          frequency={1}
          warpStrength={1}
          mouseInfluence={1}
          parallax={1}
          noise={0.3}
          transparent
          autoRotate={0}
        />

        <div className="absolute inset-0 flex items-end p-14">
          <div className="max-w-120 select-none">
            <Typography.Title
              level={1}
              style={{
                margin: 0,
                color: isDark ? "rgba(255,255,255,0.96)" : "rgba(20,20,20,0.96)",
                fontSize: 64,
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: -0.6,
                textShadow: isDark
                  ? "0 18px 60px rgba(0,0,0,0.35)"
                  : "0 18px 60px rgba(0,0,0,0.45)",
              }}
            >
              {t("auth:SLOGAN_TITLE")}
            </Typography.Title>
            <Typography.Paragraph
              style={{
                marginTop: 14,
                marginBottom: 0,
                color: isDark ? "rgba(255,255,255,0.78)" : "rgba(20,20,20,0.78)",
                fontSize: 18,
                lineHeight: 1.6,
                textShadow: isDark
                  ? "0 18px 60px rgba(0,0,0,0.35)"
                  : "0 18px 60px rgba(0,0,0,0.45)",
              }}
            >
              {t("auth:SLOGAN_SUBTITLE")}
            </Typography.Paragraph>
          </div>
        </div>
      </div>

      <div className="relative flex flex-col bg-(--color-background) text-(--color-foreground)">
        <div className="absolute top-0 right-0 p-4">
          <Space size={6}>
            <LocaleToggle />
            <ThemeModeToggle />
          </Space>
        </div>

        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-120">{children}</div>
        </div>

        <div className="p-4 text-center text-xs text-(--color-muted-foreground)">
          <Trans
            i18nKey="auth:FOOTER_COPYRIGHT"
            components={{
              brand: <span style={{ color: "var(--color-foreground)" }}>Celestial CMS</span>,
            }}
          />
        </div>
      </div>
    </div>
  );
}
