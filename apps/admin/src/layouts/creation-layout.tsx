import type { PropsWithChildren } from "react";

export function CreationLayout({ children }: PropsWithChildren) {
  return <div className="h-screen min-h-0 overflow-hidden bg-background">{children}</div>;
}
