import { ConfigProvider } from "antd";
import { type PropsWithChildren } from "react";

import { createAntdTheme, type ThemeMode } from "@celestial/ui-theme/antd-theme";

export function AntdProvider({ children }: PropsWithChildren) {
  const mode: ThemeMode = "light";

  return <ConfigProvider theme={createAntdTheme(mode)}>{children}</ConfigProvider>;
}
