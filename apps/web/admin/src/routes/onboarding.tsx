import { createFileRoute } from "@tanstack/react-router";

import { OnboardingView } from "@/pages/onboarding/page";

export const Route = createFileRoute("/onboarding")({
  component: OnboardingView,
});
