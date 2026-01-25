import { theme } from "antd";

export type ThemeMode = "light" | "dark";

export interface AntdThemeOptions {
  mode: ThemeMode;
  zIndexPopupBase?: number;
  token?: Record<string, unknown>;
}

function readCssVar(el: HTMLElement, name: string): string {
  const value = getComputedStyle(el).getPropertyValue(name);
  return value.trim();
}

function readColor(el: HTMLElement, name: string, fallback?: string): string {
  const v = readCssVar(el, name);
  if (v) return v;
  if (fallback) return fallback;
  return "transparent";
}

function readRadiusPx(el: HTMLElement): number {
  const raw = readCssVar(el, "--radius");
  if (!raw) return 10;

  // Custom properties keep their author value; normalize common units.
  const num = Number.parseFloat(raw);
  if (!Number.isFinite(num)) return 10;

  if (raw.endsWith("rem")) return num * 16;
  return num;
}

export function readAntdTokensFromCssVars(
  el: HTMLElement = document.documentElement,
  mode: ThemeMode,
) {
  const colorPrimary = readColor(el, "--primary");

  return {
    borderRadius: readRadiusPx(el),
    colorBgBase: readColor(el, "--background"),
    colorBgContainer: readColor(el, "--card"),
    colorBgElevated: readColor(el, "--popover"),
    colorBgLayout: readColor(el, "--background-deep", readColor(el, "--background")),
    colorBgMask: readColor(
      el,
      "--overlay",
      mode === "dark" ? "rgba(0, 0, 0, 0.45)" : "rgba(0, 0, 0, 0.35)",
    ),
    colorBorder: readColor(el, "--border"),
    colorBorderSecondary: readColor(el, "--border"),
    colorError: readColor(el, "--destructive"),
    colorInfo: colorPrimary,
    colorPrimary,
    colorSuccess: readColor(el, "--success", readColor(el, "--chart-2", "#52c41a")),
    colorTextBase: readColor(el, "--foreground"),
    colorWarning: readColor(el, "--warning", readColor(el, "--chart-3", "#faad14")),
  } as const;
}

export function createAntdTheme(options: AntdThemeOptions) {
  const { mode, zIndexPopupBase = 2000, token: tokenOverrides } = options;
  const baseTokens = readAntdTokensFromCssVars(document.documentElement, mode);

  const token = tokenOverrides
    ? { ...baseTokens, zIndexPopupBase, ...tokenOverrides }
    : { ...baseTokens, zIndexPopupBase };

  return {
    algorithm: mode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token,
  } as const;
}
