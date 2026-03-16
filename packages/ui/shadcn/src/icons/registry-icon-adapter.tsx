"use client";

import { forwardRef, useEffect, useRef, type ForwardRefExoticComponent } from "react";
import { cn } from "@arclayer/lib/utils";
import type { AnimatedLucideProps, LucideIcon } from "./lucide-animated-types";
import { assignRef } from "./assign-ref";
import { useIconHoverState } from "./use-icon-hover-state";

type RegistryHandle = { startAnimation: () => void; stopAnimation: () => void };
type RegistryComponent = ForwardRefExoticComponent<any>;

export function adaptRegistryIcon(Icon: RegistryComponent): LucideIcon {
  const WrappedIcon = forwardRef<HTMLSpanElement, AnimatedLucideProps>(function WrappedIcon(
    {
      isHovered,
      active = false,
      className,
      size = "100%",
      onMouseEnter,
      onMouseLeave,
      role,
      tabIndex,
      "aria-hidden": ariaHidden,
    },
    ref,
  ) {
    const handleRef = useRef<RegistryHandle | null>(null);
    const hoverState = useIconHoverState(isHovered);
    const emphasized = hoverState.hovered || active;

    useEffect(() => {
      if (emphasized) handleRef.current?.startAnimation();
      else handleRef.current?.stopAnimation();
    }, [emphasized]);

    return (
      <span
        ref={(node) => {
          hoverState.ref.current = node;
          assignRef(ref, node);
        }}
        className={cn("inline-flex items-center justify-center", className)}
        role={role}
        tabIndex={tabIndex}
        aria-hidden={ariaHidden}
        onMouseEnter={(event) => {
          hoverState.onMouseEnter();
          onMouseEnter?.(event as never);
        }}
        onMouseLeave={(event) => {
          hoverState.onMouseLeave();
          onMouseLeave?.(event as never);
        }}
      >
        <Icon ref={handleRef as never} size={size} className="size-full" />
      </span>
    );
  });

  WrappedIcon.displayName = `Adapted${Icon.displayName ?? "RegistryIcon"}`;
  return WrappedIcon;
}
