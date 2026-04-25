import { useState, type PropsWithChildren, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";

import * as authApi from "@/api/auth";
import { AdminFullLogo } from "@/components/layout/admin-logo";
import { LegalFooterLinks } from "@/components/layout/legal-footer";
import { AdminLocaleToggle } from "@/components/layout/admin-toggle-locales";
import { AdminThemeModeToggle } from "@/components/layout/admin-toggle-theme";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { Button } from "@arclayer/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@arclayer/ui/alert-dialog";

export function OnboardingLayout(props: PropsWithChildren<{ aside: ReactNode }>) {
  const { t } = useTranslation(["onboarding", "common"]);
  const navigate = useNavigate();
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const clearAuth = useAuthStore((state) => state.clear);
  const clearWorkspace = useWorkspaceStore((state) => state.clearWorkspace);
  const [signOutOpen, setSignOutOpen] = useState(false);

  const handleSignOut = () => {
    void (async () => {
      try {
        await authApi.logout({ refreshToken });
      } finally {
        clearAuth();
        clearWorkspace();
        await navigate({ to: "/login", replace: true });
      }
    })();
  };

  return (
    <div className="min-h-dvh bg-background text-label-primary">
      <div className="flex min-h-dvh flex-col">
        <header className="grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-6">
          <div />
          <AdminFullLogo
            to="/welcome"
            ariaLabel="Arclayer"
            width={128}
            className="justify-self-center"
          />
          <div className="flex items-center justify-self-end gap-2">
            <AdminLocaleToggle />
            <AdminThemeModeToggle />
          </div>
        </header>

        <main className="flex min-h-0 flex-1 items-center justify-center px-4 py-8 sm:px-8">
          <div className="h-160 w-[min(calc(100vw-2rem),64rem)] overflow-hidden rounded-xl border border-border bg-background sm:w-[min(calc(100vw-4rem),64rem)]">
            <div className="grid h-full items-stretch lg:grid-cols-[minmax(420px,520px)_minmax(320px,1fr)]">
              <section className="h-full min-w-0 overflow-hidden p-6 sm:py-8 sm:px-16">
                {props.children}
              </section>
              <aside className="hidden h-full min-h-0 overflow-hidden bg-muted lg:block">
                {props.aside}
              </aside>
            </div>
          </div>
        </main>

        <footer className="shrink-0 px-4 py-4 text-center text-footnote text-label-secondary">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <LegalFooterLinks
              privacyLabel={t("WELCOME_PRIVACY_POLICY")}
              termsLabel={t("WELCOME_TERMS_OF_SERVICE")}
              className="contents"
              buttonClassName="inline-flex h-auto px-2 py-0 text-footnote font-semibold text-primary underline-offset-4 transition-[box-shadow,_color,_background-color,_border-color,_outline-color,_text-decoration-color,_fill,_stroke] hover:underline focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"
            />
            <Button
              variant="link"
              className="h-auto px-2 py-0 text-footnote"
              onClick={() => setSignOutOpen(true)}
            >
              {t("WELCOME_SIGN_OUT")}
            </Button>
          </div>
          <div className="mt-1">{t("onboarding:WELCOME_FOOTER_COPYRIGHT")}</div>
        </footer>
      </div>

      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("WELCOME_SIGN_OUT_CONFIRM_TITLE")}</AlertDialogTitle>
            <AlertDialogDescription>{t("WELCOME_SIGN_OUT_CONFIRM_DESC")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:CANCEL")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleSignOut}>
              {t("WELCOME_SIGN_OUT_CONFIRM_ACTION")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
