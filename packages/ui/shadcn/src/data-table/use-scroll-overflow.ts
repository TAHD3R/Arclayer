"use client";

import * as React from "react";

/**
 * Detect whether the scroll container has overflow on the right side.
 * Returns true when there is still content to scroll to the right.
 */
export function useScrollOverflow(ref: React.RefObject<HTMLDivElement | null>) {
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const check = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // 1px tolerance for sub-pixel rounding
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, [ref]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    check();
    el.addEventListener("scroll", check, { passive: true });

    // ResizeObserver may be unavailable in test environments (jsdom).
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null;
    ro?.observe(el);

    return () => {
      el.removeEventListener("scroll", check);
      ro?.disconnect();
    };
  }, [ref, check]);

  return canScrollRight;
}
