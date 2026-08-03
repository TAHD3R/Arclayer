import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function PlatformAuthLayout({
  utilities,
  children,
}: Readonly<{ utilities: ReactNode; children: ReactNode }>) {
  const { t } = useTranslation(["common", "access"]);
  return (
    <main className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(28rem,0.82fr)]">
      <section className="flex min-h-svh flex-col">
        <header className="flex h-16 items-center justify-between gap-4 border-b px-5 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <img alt="" aria-hidden="true" className="size-7" src="/logo.svg" />
            <span className="truncate text-sm font-semibold">{t("common:APP_NAME")}</span>
          </div>
          <div className="flex items-center gap-1">{utilities}</div>
        </header>
        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </section>
      <aside className="relative hidden overflow-hidden border-l bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-between lg:p-10 dark:bg-card">
        <div aria-hidden="true" className="grid grid-cols-6 gap-px opacity-40">
          {Array.from({ length: 30 }, (_, index) => (
            <span className="aspect-square border border-sidebar-border" key={index} />
          ))}
        </div>
        <div className="relative max-w-lg space-y-6 rounded-xl border border-sidebar-border bg-sidebar/95 p-7 shadow-sm dark:bg-card/95">
          <span className="flex size-11 items-center justify-center rounded-lg border bg-background text-primary shadow-xs">
            <ShieldCheck aria-hidden="true" className="size-5" />
          </span>
          <div className="space-y-3">
            <h2 className="text-2xl1 font-semibold tracking-tight">
              {t("access:PLATFORM_VERIFICATION_REQUIRED")}
            </h2>
            <p className="text-base leading-7 text-muted-foreground">
              {t("access:SECURITY_KEY_SETUP_DESCRIPTION")}
            </p>
          </div>
          <div className="border-t pt-5 text-sm text-muted-foreground">
            {t("access:CREDENTIALS_DESCRIPTION")}
          </div>
        </div>
        <p className="relative text-sm text-muted-foreground">{t("common:APP_NAME")}</p>
      </aside>
    </main>
  );
}
