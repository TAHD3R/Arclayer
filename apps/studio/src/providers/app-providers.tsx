import { App, ConfigProvider } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type PropsWithChildren, useMemo } from "react";

import { createAntdTheme } from "@celestial/theme/antd";
import { usePreferencesStore } from "@/stores/use-preferences-store";

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function AppProviders({ children }: PropsWithChildren) {
  const locale = usePreferencesStore((s) => s.locale);
  const themeMode = usePreferencesStore((s) => s.themeMode);

  const antdLocale = locale === "zh-CN" ? zhCN : enUS;
  const antdTheme = useMemo(() => createAntdTheme({ mode: themeMode }), [themeMode]);
  const queryClient = useMemo(() => makeQueryClient(), []);

  return (
    <ConfigProvider locale={antdLocale} theme={antdTheme}>
      <App message={{ maxCount: 3 }} notification={{ maxCount: 3 }}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </App>
    </ConfigProvider>
  );
}
