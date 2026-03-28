import type { PlateElementProps } from "platejs/react";

import { PlateElement } from "platejs/react";

export function LinkElement(props: PlateElementProps) {
  const element = props.element as { target?: string; url?: string };
  const href = typeof element.url === "string" ? element.url : "";
  const target = typeof element.target === "string" ? element.target : "_blank";

  return (
    <PlateElement
      {...props}
      as="span"
      data-link-target={target}
      data-link-url={href}
      className="rounded-sm text-primary underline decoration-primary/35 underline-offset-4 transition-colors hover:text-primary/80"
    />
  );
}
