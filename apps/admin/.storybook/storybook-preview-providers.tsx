import { type PropsWithChildren, useEffect } from "react";
import type { Decorator } from "@storybook/react-vite";

import { DirectionProvider } from "@arclayer/ui/direction";
import type { ThemeMode } from "@arclayer/ui/theme-mode";
import { TooltipProvider } from "@arclayer/ui/tooltip";

type StorybookLocale = "en-US" | "zh-CN";
type StorybookDirection = "ltr" | "rtl";

type StorybookPreviewGlobals = {
  direction?: StorybookDirection;
  locale?: StorybookLocale;
  theme?: ThemeMode;
};

type StorybookPreviewProvidersProps = PropsWithChildren<{
  direction: StorybookDirection;
  locale: StorybookLocale;
  theme: ThemeMode;
}>;

function applyDocumentGlobals({
  direction,
  locale,
  theme,
}: Omit<StorybookPreviewProvidersProps, "children">) {
  const root = document.documentElement;

  root.dataset.theme = theme;
  root.lang = locale;
  root.dir = direction;
}

function StorybookPreviewProviders({
  children,
  direction,
  locale,
  theme,
}: StorybookPreviewProvidersProps) {
  useEffect(() => {
    applyDocumentGlobals({ direction, locale, theme });
  }, [direction, locale, theme]);

  return (
    <DirectionProvider dir={direction} direction={direction}>
      <TooltipProvider>
        <div className="bg-background text-foreground min-h-screen">{children}</div>
      </TooltipProvider>
    </DirectionProvider>
  );
}

export const withUiPreviewProviders: Decorator = (Story, context) => {
  const globals = context.globals as StorybookPreviewGlobals;

  return (
    <StorybookPreviewProviders
      direction={globals.direction ?? "ltr"}
      locale={globals.locale ?? "en-US"}
      theme={globals.theme ?? "light"}
    >
      <Story />
    </StorybookPreviewProviders>
  );
};
