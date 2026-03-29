import { useLink } from "@platejs/link/react";
import type { TLinkElement } from "platejs";
import type { PlateElementProps } from "platejs/react";

import { PlateElement } from "platejs/react";

export function LinkElement(props: PlateElementProps) {
  const element = props.element as TLinkElement;
  const { props: linkProps } = useLink({ element });

  return (
    <PlateElement
      {...props}
      as="a"
      className="rounded-sm text-primary underline decoration-primary/35 underline-offset-4 transition-colors hover:text-primary/80"
      {...linkProps}
    />
  );
}
