import { theme } from "antd";

export type ThemeMode = "light" | "dark";

export function createAntdTheme(mode: ThemeMode) {
  return {
    algorithm: mode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: "var(--color-primary)",
      colorBgBase: "var(--color-bg)",
      colorTextBase: "var(--color-fg)",
      colorBorder: "var(--color-border)",
      borderRadius: 10,
    },
  } as const;
}
