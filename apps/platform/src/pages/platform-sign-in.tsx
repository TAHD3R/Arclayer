import { PlatformLoginForm } from "@/components/platform-login-form";
import {
  PlatformLoginBackground,
  PlatformLoginLogo,
  PlatformLoginPreferences,
} from "@/components/platform-login-visuals";

export function PlatformSignInPage() {
  return (
    <main className="relative grid min-h-svh grid-rows-[2.5rem_minmax(0,1fr)_2.5rem] overflow-hidden bg-background p-6 md:p-10">
      <PlatformLoginBackground />
      <header className="relative z-10 flex items-center justify-center">
        <PlatformLoginLogo />
      </header>
      <section className="relative z-10 flex items-center justify-center py-8">
        <div className="w-full max-w-sm">
          <PlatformLoginForm />
        </div>
      </section>
      <footer className="relative z-10 flex items-center justify-center">
        <PlatformLoginPreferences />
      </footer>
    </main>
  );
}
