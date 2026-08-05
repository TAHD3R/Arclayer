import type { ReactNode } from "react";

export function WelcomeFieldError(props: { children: ReactNode }) {
  return <div className="text-footnote text-destructive">{props.children}</div>;
}
