import { useDocumentTitle as useDocumentTitleBase } from "@arclayer/hooks/use-document-title";

import { getAppConfig } from "@/constants/app-config";

/**
 * Admin wrapper for `@arclayer/hooks/use-document-title`.
 * Injects app brand title from config.
 */
export function useDocumentTitle(pageTitle: string | null | undefined): void {
  const brand = (getAppConfig().title || "Arclayer").trim();
  useDocumentTitleBase(pageTitle, { brand, separator: " | " });
}
