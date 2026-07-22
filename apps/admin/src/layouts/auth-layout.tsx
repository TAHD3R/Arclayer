import type { PropsWithChildren } from "react";

import Aurora from "@/components/Aurora";
import { AuthSceneLayout } from "@/layouts/auth-scene-layout";
import { AuthPreferencesBar } from "@/layouts/auth-preferences-bar";
import { usePreferencesStore } from "@/stores/use-preference-store";

const AUTH_AURORA_COLOR_STOPS = {
  light: ["#238bff", "#8ba4c7", "#238bff"],
  dark: ["#339cff", "#526477", "#339cff"],
} satisfies Record<"light" | "dark", [string, string, string]>;

export function AuthLayout({ children }: PropsWithChildren) {
  const themeMode = usePreferencesStore((state) => state.themeMode);

  return (
    <AuthSceneLayout
      logoTo="/login"
      footer={<AuthPreferencesBar />}
      background={
        <div
          data-testid="auth-aurora"
          className="h-1/2 w-full opacity-30 [mask-image:linear-gradient(to_bottom,black,transparent)]"
        >
          <Aurora
            colorStops={AUTH_AURORA_COLOR_STOPS[themeMode]}
            amplitude={0.8}
            blend={0.75}
            speed={0.35}
            luminanceLift={themeMode === "light" ? 1 : 0}
          />
        </div>
      }
      withRouteTransition
    >
      {children}
    </AuthSceneLayout>
  );
}
