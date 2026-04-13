import { createFileRoute } from "@tanstack/react-router";

import { isAuthScenePath } from "@/lib/routing/route-identity";
import type { LoginMode } from "@/lib/auth/auth-mode";

type LoginSearch = {
  redirect?: string;
  mode?: LoginMode;
  oauth_code?: string;
  oauth_error?: string;
};

export const Route = createFileRoute("/login/")({
  staticData: { titleKey: "auth:LOGIN_PAGE_TITLE" },
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const redirect =
      typeof search.redirect === "string" &&
      search.redirect.startsWith("/") &&
      !search.redirect.startsWith("//")
        ? search.redirect
        : undefined;

    const mode =
      search.mode === "register"
        ? "register"
        : search.mode === "forgot-password"
          ? "forgot-password"
          : search.mode === "email-code"
            ? "email-code"
            : "login";

    const oauth_code = typeof search.oauth_code === "string" ? search.oauth_code : undefined;
    const oauth_error = typeof search.oauth_error === "string" ? search.oauth_error : undefined;

    // Never allow redirect to point back to auth pages (prevents recursive /login?redirect=/login?... loops).
    const safeRedirect = (() => {
      if (!redirect) return undefined;
      const pathname = redirect.split("?")[0] || "";
      if (isAuthScenePath(pathname)) return undefined;
      return redirect;
    })();

    return {
      ...(safeRedirect ? { redirect: safeRedirect } : {}),
      mode,
      ...(oauth_code ? { oauth_code } : {}),
      ...(oauth_error ? { oauth_error } : {}),
    };
  },
});
