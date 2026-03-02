import { useMemo } from "react";

import { createAntdTheme } from "@celestial/design-tokens/antd";
import { usePreferencesStore } from "@/stores/use-preference-store";

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function scalePx(value: number, scale: number): number {
  // Keep stable integer values to avoid Antd style churn (sub-pixel font sizes can also look blurry).
  return clampInt(value * scale, 10, 48);
}

export function useAntdTheme() {
  const mode = usePreferencesStore((s) => s.themeMode);
  const fontScalePreference = usePreferencesStore((s) => s.fontScalePreference);
  const fontWeightPreference = usePreferencesStore((s) => s.fontWeightPreference);

  const fontScale = fontScalePreference ?? 1;
  const fontWeightBody = fontWeightPreference ?? 400;
  const fontWeightDelta = fontWeightBody - 400;
  const fontWeightStrong = clampInt(600 + fontWeightDelta, 300, 800);

  return useMemo(
    () =>
      createAntdTheme({
        mode,
        token: {
          fontSize: scalePx(16, fontScale),
          fontSizeSM: scalePx(13, fontScale),
          fontSizeLG: scalePx(16, fontScale),
          fontSizeHeading1: scalePx(34, fontScale),
          fontSizeHeading2: scalePx(28, fontScale),
          fontSizeHeading3: scalePx(22, fontScale),
          fontWeightStrong,
        },
        components: {
          Button: {
            fontWeight: fontWeightStrong,
          },
          Input: {
            inputFontSize: scalePx(16, fontScale),
            inputFontSizeLG: scalePx(16, fontScale),
            inputFontSizeSM: scalePx(13, fontScale),
          },
          InputNumber: {
            inputFontSize: scalePx(16, fontScale),
            inputFontSizeLG: scalePx(16, fontScale),
            inputFontSizeSM: scalePx(13, fontScale),
          },
          Select: {
            optionFontSize: scalePx(16, fontScale),
          },
        },
      }),
    [fontScale, fontWeightStrong, mode],
  );
}
