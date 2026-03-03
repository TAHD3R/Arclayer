import { useDocumentTitle as useDocumentTitleBase } from "@celestial/hooks/use-document-title";

import { getAppConfig } from "@/constants/app-config";

/**
 * Admin wrapper for `@celestial/hooks/use-document-title`.
 * Injects app brand title from config.
 */
export function useDocumentTitle(pageTitle: string | null | undefined): void {
  const brand = (getAppConfig().title || "Celestial").trim();
  useDocumentTitleBase(pageTitle, { brand, separator: " | " });
}
