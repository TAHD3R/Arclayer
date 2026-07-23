import type { PropsWithChildren } from "react";

import { AuroraSceneBackground } from "@/components/aurora-scene-background";
import { AuthSceneLayout } from "@/layouts/auth-scene-layout";
import { AuthPreferencesBar } from "@/layouts/auth-preferences-bar";

export function AuthLayout({ children }: PropsWithChildren) {
  return (
    <AuthSceneLayout
      logoTo="/login"
      footer={<AuthPreferencesBar />}
      background={<AuroraSceneBackground testId="auth-aurora" />}
      withRouteTransition
    >
      {children}
    </AuthSceneLayout>
  );
}
