import { useEffect } from "react";

/**
 * Lock document scrolling by setting overflow:hidden on html + body.
 * Restores previous overflow values on unmount.
 */
export function useLockViewport(): void {
  useEffect(() => {
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, []);
}
