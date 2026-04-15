import type { PropsWithChildren } from "react";

import { AdminFullLogo } from "@/components/layout/admin-logo";
import { AdminLocaleToggle } from "@/components/layout/admin-toggle-locales";
import { AdminThemeModeToggle } from "@/components/layout/admin-toggle-theme";
import { LegalFooter, LegalFooterCopyright } from "@/components/layout/legal-footer";
import { useLockViewport } from "@arclayer/hooks/use-lock-viewport";

export function InviteLayout({ children }: PropsWithChildren) {
  useLockViewport();

  return (
    <div className="fixed inset-0 overflow-hidden bg-background text-label-primary">
      <div className="absolute inset-0 bg-background" />

      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-center justify-between p-4">
          <AdminFullLogo to="/login" ariaLabel="Arclayer" width={120} />
          <div className="flex items-center gap-2">
            <AdminLocaleToggle />
            <AdminThemeModeToggle />
          </div>
        </div>

        <div className="flex-1 min-h-0 flex items-center justify-center overflow-y-auto p-8">
          <div className="w-full max-w-120">{children}</div>
        </div>

        <div className="p-4 text-center space-y-1">
          <LegalFooter i18nKey="auth:LEGAL_CONTINUE" />
          <LegalFooterCopyright />
        </div>
      </div>
    </div>
  );
}
