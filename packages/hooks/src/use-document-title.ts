import { useEffect } from "react";

export type UseDocumentTitleOptions = {
  brand: string;
  separator?: string;
};

function resolveDocumentTitle(
  pageTitle: string | null | undefined,
  options: UseDocumentTitleOptions,
): string {
  const brand = options.brand.trim();
  if (!brand) {
    throw new Error("useDocumentTitle: options.brand must be a non-empty string");
  }

  const separator = options.separator ?? " | ";
  const trimmedTitle = typeof pageTitle === "string" ? pageTitle.trim() : "";
  if (trimmedTitle) return `${trimmedTitle}${separator}${brand}`;
  return brand;
}

/**
 * Sets document.title based on a page title and injected brand.
 *
 * - When pageTitle is empty/null/whitespace, uses brand only.
 * - Trims pageTitle.
 */
export function useDocumentTitle(
  pageTitle: string | null | undefined,
  options: UseDocumentTitleOptions,
): void {
  const title = resolveDocumentTitle(pageTitle, options);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = title;
  }, [title]);
}
