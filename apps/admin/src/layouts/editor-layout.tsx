import { type PropsWithChildren } from "react";

import { useLockViewport } from "@celestial/hooks/use-lock-viewport";

export function EditorLayout({ children }: PropsWithChildren) {
  useLockViewport();

  return (
    <div className="fixed inset-0 w-full overflow-hidden bg-background text-label-primary">
      {children}
    </div>
  );
}
