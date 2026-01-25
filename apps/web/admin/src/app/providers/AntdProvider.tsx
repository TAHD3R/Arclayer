import { ConfigProvider } from "antd";
import { type PropsWithChildren } from "react";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";

import { usePreferencesStore } from "@/stores/preferences.store";
import { useAntdTheme } from "@/app/hooks/useAntdTheme";
import { AntdMessageProvider } from "@/app/providers/AntdMessageProvider";

export function AntdProvider({ children }: PropsWithChildren) {
  const locale = usePreferencesStore((s) => s.locale);

  const theme = useAntdTheme();
  const antdLocale = locale === "zh-CN" ? zhCN : enUS;

  return (
    <ConfigProvider theme={theme} locale={antdLocale}>
      <AntdMessageProvider>{children}</AntdMessageProvider>
    </ConfigProvider>
  );
}
