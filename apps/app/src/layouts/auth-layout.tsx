import type { PropsWithChildren } from "react";

import { AuthSceneLayout } from "@/layouts/auth-scene-layout";

export function AuthLayout({ children }: PropsWithChildren) {
  return (
    <AuthSceneLayout
      logoTo="/login"
      footer={null}
      hideHeader
      contentMaxClassName="max-w-[25.875rem]"
      withRouteTransition
    >
      {children}
    </AuthSceneLayout>
  );
}
