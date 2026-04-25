import type { WelcomeOnboardingStep } from "../types";

export function getWelcomeStepImage(step: WelcomeOnboardingStep): string {
  if (step === 1) return "/onboarding/onboarding-01.jpg";
  if (step === 2) return "/onboarding/onboarding-02.jpg";
  return "/onboarding/onboarding-03.jpg";
}

export function getWelcomeStepTitleKey(step: WelcomeOnboardingStep): string {
  if (step === 1) return "WELCOME_STEP_PROFILE_TITLE";
  if (step === 2) return "WELCOME_STEP_WORKSPACE_TITLE";
  if (step === 3) return "WELCOME_STEP_TEAM_TITLE";
  return "WELCOME_STEP_CUSTOMIZE_TITLE";
}

export function getWelcomeStepDescriptionKey(step: WelcomeOnboardingStep): string | null {
  if (step === 3) return "WELCOME_STEP_TEAM_DESC";
  if (step === 4) return "WELCOME_STEP_CUSTOMIZE_DESC";
  return null;
}
