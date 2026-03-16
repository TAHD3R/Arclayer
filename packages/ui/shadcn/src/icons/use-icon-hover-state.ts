"use client";

import { useEffect, useRef, useState } from "react";

const ICON_HOVER_TARGET_SELECTOR = [
  "button",
  "a[href]",
  "[role='button']",
  "[role='menuitem']",
  "[role='menuitemcheckbox']",
  "[role='menuitemradio']",
  "[role='option']",
  "[role='tab']",
  "[tabindex]:not([tabindex='-1'])",
  "[data-slot='button']",
  "[data-sidebar='menu-button']",
  "[cmdk-item]",
].join(", ");

export function useIconHoverState(isHovered?: boolean) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [selfHovered, setSelfHovered] = useState(false);
  const [ancestorHovered, setAncestorHovered] = useState(false);

  useEffect(() => {
    if (isHovered !== undefined) return;
    const target = ref.current?.parentElement?.closest<HTMLElement>(ICON_HOVER_TARGET_SELECTOR);
    if (!target) return;

    const onEnter = () => setAncestorHovered(true);
    const onLeave = () => setAncestorHovered(false);

    target.addEventListener("pointerenter", onEnter);
    target.addEventListener("pointerleave", onLeave);
    return () => {
      target.removeEventListener("pointerenter", onEnter);
      target.removeEventListener("pointerleave", onLeave);
    };
  }, [isHovered]);

  return {
    ref,
    hovered: isHovered ?? (selfHovered || ancestorHovered),
    onMouseEnter: () => setSelfHovered(true),
    onMouseLeave: () => setSelfHovered(false),
  };
}
