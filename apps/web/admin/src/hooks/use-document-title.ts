import { useEffect } from "react";

import { getAppConfig } from "@/constants/app-config";

/**
 * Set document.title to `${pageTitle} | ${brand}`.
 * Falls back to brand-only when pageTitle is empty/null.
 */
export function useDocumentTitle(pageTitle: string | null | undefined): void {
  useEffect(() => {
    const brand = (getAppConfig().title || "Celestial").trim();
    if (pageTitle && pageTitle.trim()) {
      document.title = `${pageTitle.trim()} | ${brand}`;
    } else {
      document.title = brand;
    }
  }, [pageTitle]);
}
