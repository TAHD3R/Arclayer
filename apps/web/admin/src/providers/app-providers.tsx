import { App, ConfigProvider, message } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import { ProgressProvider } from "@bprogress/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { type PropsWithChildren, useLayoutEffect, useState } from "react";

import { useAntdTheme } from "@/hooks/use-antd-theme";
import { makeQueryClient } from "@/lib/query/query-client";
import { setMessageApi } from "@/lib/notifications";
import { usePreferencesStore } from "@/stores/use-preference-store";

function AntdMessageBridge({ children }: PropsWithChildren) {
  const [messageApi, contextHolder] = message.useMessage();

  useLayoutEffect(() => {
    setMessageApi(messageApi);
    return () => setMessageApi(null);
  }, [messageApi]);

  return (
    <>
      {contextHolder}
      {children}
    </>
  );
}

export function AppProviders({ children }: PropsWithChildren) {
  const locale = usePreferencesStore((s) => s.locale);
  const theme = useAntdTheme();
  const antdLocale = locale === "zh-CN" ? zhCN : enUS;
  const [queryClient] = useState(() => makeQueryClient());

  return (
    <ProgressProvider color="var(--primary)" height="2px">
      <ConfigProvider theme={theme} locale={antdLocale}>
        <App message={{ maxCount: 3 }} notification={{ maxCount: 3 }}>
          <AntdMessageBridge>
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
          </AntdMessageBridge>
        </App>
      </ConfigProvider>
    </ProgressProvider>
  );
}
