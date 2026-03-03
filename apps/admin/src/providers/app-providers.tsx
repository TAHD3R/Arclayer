import { App, ConfigProvider, message } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import {
  StyleProvider,
  autoPrefixTransformer,
  legacyLogicalPropertiesTransformer,
} from "@ant-design/cssinjs";
import { ProgressProvider } from "@bprogress/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { type PropsWithChildren, useLayoutEffect } from "react";
import { useTranslation } from "react-i18next";
import { getPopupContainerWithinOverlay } from "@/lib/antd/popup-container";

import { ChromeTabsProvider } from "@celestial/ui/chrome-tabs";
import { TooltipProvider } from "@celestial/ui/tooltip";
import { useAntdTheme } from "@/hooks/use-antd-theme";
import { queryClient } from "@/lib/query/query-client-instance";
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
  const { t } = useTranslation("common");
  const locale = usePreferencesStore((s) => s.locale);
  const userReducedMotion = usePreferencesStore((s) => s.reduceMotion);
  const theme = useAntdTheme();
  const antdLocale = locale === "zh-CN" ? zhCN : enUS;

  return (
    <ProgressProvider color="var(--primary)" height="2px">
      <StyleProvider
        layer
        hashPriority="high"
        transformers={[legacyLogicalPropertiesTransformer, autoPrefixTransformer]}
      >
        <ConfigProvider
          theme={theme}
          locale={antdLocale}
          getPopupContainer={(triggerNode) => getPopupContainerWithinOverlay(triggerNode)}
        >
          <App message={{ maxCount: 3 }} notification={{ maxCount: 3 }}>
            <AntdMessageBridge>
              <QueryClientProvider client={queryClient}>
                <ChromeTabsProvider
                  userReducedMotion={userReducedMotion}
                  labels={{
                    scrollLeftAriaLabel: t("TABS_SCROLL_LEFT"),
                    scrollRightAriaLabel: t("TABS_SCROLL_RIGHT"),
                  }}
                >
                  <TooltipProvider>{children}</TooltipProvider>
                </ChromeTabsProvider>
              </QueryClientProvider>
            </AntdMessageBridge>
          </App>
        </ConfigProvider>
      </StyleProvider>
    </ProgressProvider>
  );
}
