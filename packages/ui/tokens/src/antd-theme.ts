import { theme } from "antd";

export type ThemeMode = "light" | "dark";

type AntdMappingAlgorithm = typeof theme.defaultAlgorithm;
type AntdTokenValue = string | number | boolean;

export type AntdComponentThemeOverrides = Record<string, AntdTokenValue> & {
  algorithm?: boolean | AntdMappingAlgorithm | AntdMappingAlgorithm[];
};

export type AntdComponentsThemeOverrides = Record<string, AntdComponentThemeOverrides>;

export interface AntdThemeOptions {
  mode: ThemeMode;
  /**
   * Root element to read CSS variables from (defaults to `document.documentElement`).
   *
   * - Pass this to avoid touching `document` in SSR/test environments
   * - Useful for Shadow DOM / multi-document scenarios
   */
  element?: HTMLElement | null;
  zIndexPopupBase?: number;
  token?: Record<string, AntdTokenValue>;
  components?: AntdComponentsThemeOverrides;
  /**
   * Pass-through fields for Antd Theme API (opt-in; no forced defaults here).
   * See: ConfigProvider `theme` => `inherit / hashed / cssVar / zeroRuntime`.
   */
  inherit?: boolean;
  hashed?: boolean;
  cssVar?: { prefix?: string; key?: string };
  zeroRuntime?: boolean;
  /**
   * Override algorithm selection (default: choose light/dark by `mode`).
   * Supports single algorithm or algorithm array, matching Antd's contract.
   */
  algorithm?: AntdMappingAlgorithm | AntdMappingAlgorithm[];
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

function readRootFontSizePx(el: HTMLElement): number {
  const doc = el.ownerDocument;
  const root = doc?.documentElement;
  if (!root) return 16;

  const raw = getComputedStyle(root).fontSize;
  const num = Number.parseFloat(raw);
  return Number.isFinite(num) ? num : 16;
}

function readRadiusPx(el: HTMLElement, rootFontSizePx: number): number {
  const raw = readCssVar(el, "--radius");
  if (!raw) return 10;

  // Custom properties keep their author value; normalize common units.
  const normalized = raw.trim().toLowerCase();
  const num = Number.parseFloat(normalized);
  if (!Number.isFinite(num)) return 10;

  if (normalized.endsWith("rem")) return num * rootFontSizePx;
  return num;
}

function readLengthPx(
  el: HTMLElement,
  name: string,
  fallback: number,
  rootFontSizePx: number,
): number {
  const raw = readCssVar(el, name);
  if (!raw) return fallback;

  const normalized = raw.trim().toLowerCase();
  const num = Number.parseFloat(normalized);
  if (!Number.isFinite(num)) return fallback;

  if (normalized.endsWith("rem")) return num * rootFontSizePx;
  return num;
}

export function readAntdTokensFromCssVars(el: HTMLElement | null | undefined, mode: ThemeMode) {
  if (!el || typeof getComputedStyle === "undefined") {
    // In SSR/tests, avoid reading CSS variables. Final appearance is controlled by
    // Antd defaults + user-provided overrides.
    return {
      borderRadius: 10,
      colorPrimary: "#1677ff",
      colorInfo: "#1677ff",
      colorError: "#ff4d4f",
      colorSuccess: "#52c41a",
      colorWarning: "#faad14",
      colorBgBase: "#fff",
      colorBgContainer: "#fff",
      colorBgElevated: "#fff",
      colorBgLayout: "#f5f5f5",
      colorBgMask: mode === "dark" ? "rgba(0, 0, 0, 0.45)" : "rgba(0, 0, 0, 0.35)",
      colorBorder: "#d9d9d9",
      colorBorderSecondary: "#f0f0f0",
      colorTextBase: "#000",
      colorText: "rgba(0,0,0,0.88)",
      colorTextSecondary: "rgba(0,0,0,0.65)",
      colorTextTertiary: "rgba(0,0,0,0.45)",
      colorTextQuaternary: "rgba(0,0,0,0.25)",
      fontSize: 16,
      fontSizeSM: 13,
      fontSizeLG: 16,
      fontSizeHeading1: 34,
      fontSizeHeading2: 28,
      fontSizeHeading3: 22,
    } as const;
  }

  const rootFontSizePx = readRootFontSizePx(el);

  const colorPrimary = readColor(el, "--primary", "#1677ff");

  return {
    borderRadius: readRadiusPx(el, rootFontSizePx),
    colorBgBase: readColor(el, "--background", "#fff"),
    colorBgContainer: readColor(el, "--card", "#fff"),
    colorBgElevated: readColor(el, "--popover", "#fff"),
    colorBgLayout: readColor(el, "--background-deep", readColor(el, "--background", "#f5f5f5")),
    colorBgMask: readColor(
      el,
      "--overlay",
      mode === "dark" ? "rgba(0, 0, 0, 0.45)" : "rgba(0, 0, 0, 0.35)",
    ),
    colorBorder: readColor(el, "--border", "#d9d9d9"),
    colorBorderSecondary: readColor(el, "--border", "#f0f0f0"),
    colorError: readColor(el, "--destructive", "#ff4d4f"),
    colorInfo: colorPrimary,
    colorPrimary,
    colorSuccess: readColor(el, "--success", readColor(el, "--chart-2", "#52c41a")),
    colorText: readColor(el, "--text-primary", readColor(el, "--foreground", "rgba(0,0,0,0.88)")),
    colorTextSecondary: readColor(
      el,
      "--text-secondary",
      readColor(el, "--muted-foreground", "rgba(0,0,0,0.65)"),
    ),
    colorTextTertiary: readColor(
      el,
      "--text-tertiary",
      mode === "dark" ? "rgba(255, 255, 255, 0.45)" : "rgba(0, 0, 0, 0.35)",
    ),
    colorTextQuaternary: readColor(
      el,
      "--text-quaternary",
      mode === "dark" ? "rgba(255, 255, 255, 0.30)" : "rgba(0, 0, 0, 0.25)",
    ),
    colorTextBase: readColor(el, "--foreground", "#000"),
    colorWarning: readColor(el, "--warning", readColor(el, "--chart-3", "#faad14")),
    fontSize: readLengthPx(el, "--font-size-body", 16, rootFontSizePx),
    fontSizeSM: readLengthPx(el, "--font-size-footnote", 13, rootFontSizePx),
    fontSizeLG: readLengthPx(el, "--font-size-body", 16, rootFontSizePx),
    fontSizeHeading1: readLengthPx(el, "--font-size-largetitle", 34, rootFontSizePx),
    fontSizeHeading2: readLengthPx(el, "--font-size-title", 28, rootFontSizePx),
    fontSizeHeading3: readLengthPx(el, "--font-size-title2", 22, rootFontSizePx),
  } as const;
}

export function createAntdTheme(options: AntdThemeOptions) {
  const {
    mode,
    element,
    zIndexPopupBase = 2000,
    token: tokenOverrides,
    components: componentOverrides,
    inherit,
    hashed,
    cssVar,
    zeroRuntime,
    algorithm,
  } = options;
  const rootEl = element ?? (typeof document === "undefined" ? null : document.documentElement);
  const baseTokens = readAntdTokensFromCssVars(rootEl, mode);

  const token = tokenOverrides
    ? { ...baseTokens, zIndexPopupBase, ...tokenOverrides }
    : { ...baseTokens, zIndexPopupBase };

  const components = componentOverrides ? { ...componentOverrides } : {};

  const resolvedAlgorithm =
    algorithm ?? (mode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm);

  return {
    algorithm: resolvedAlgorithm,
    token,
    components,
    ...(inherit === undefined ? {} : { inherit }),
    ...(hashed === undefined ? {} : { hashed }),
    ...(cssVar === undefined ? {} : { cssVar }),
    ...(zeroRuntime === undefined ? {} : { zeroRuntime }),
  } as const;
}
