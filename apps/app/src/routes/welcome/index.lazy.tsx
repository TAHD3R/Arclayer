import { createLazyFileRoute } from "@tanstack/react-router";

import { WelcomeOnboardingPage } from "@/pages/onboarding/welcome/page";

export const Route = createLazyFileRoute("/welcome/")({
  component: WelcomeOnboardingPage,
});
