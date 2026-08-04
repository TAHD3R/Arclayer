import type { PropsWithChildren } from "react";

import { AuthShowcaseBackground } from "@/components/auth-showcase-background";
import { AuthSceneLayout } from "@/layouts/auth-scene-layout";

export function AuthLayout({ children }: PropsWithChildren) {
  return (
    <AuthSceneLayout
      logoTo="/login"
      footer={null}
      hideHeader
      background={<AuthShowcaseBackground />}
      contentClassName="max-md:-mt-[20px]"
      contentMaxClassName="max-w-[25.875rem]"
      withRouteTransition
    >
      {children}
    </AuthSceneLayout>
  );
}
