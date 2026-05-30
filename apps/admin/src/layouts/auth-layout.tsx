import type { PropsWithChildren } from "react";

import { AuthSceneLayout } from "@/layouts/auth-scene-layout";
import { AuthPreferencesBar } from "@/layouts/auth-preferences-bar";

export function AuthLayout({ children }: PropsWithChildren) {
  return (
    <AuthSceneLayout logoTo="/login" footer={<AuthPreferencesBar />} withRouteTransition>
      {children}
    </AuthSceneLayout>
  );
}
