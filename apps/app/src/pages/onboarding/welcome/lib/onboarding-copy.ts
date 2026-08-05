import type { WelcomeOnboardingStepId } from "../types";

export function getWelcomeStepTitleKey(step: WelcomeOnboardingStepId): string {
  if (step === "profile") return "WELCOME_STEP_PROFILE_TITLE";
  if (step === "workspace") return "WELCOME_STEP_WORKSPACE_TITLE";
  if (step === "team") return "WELCOME_STEP_TEAM_TITLE";
  if (step === "teamType") return "WELCOME_CUSTOMIZE_TEAM_TYPE_QUESTION";
  return "WELCOME_CUSTOMIZE_HEARD_ABOUT_US_QUESTION";
}

export function getWelcomeStepDescriptionKey(step: WelcomeOnboardingStepId): string | null {
  if (step === "team") return "WELCOME_STEP_TEAM_DESC";
  if (step === "teamType") return "WELCOME_CUSTOMIZE_PROGRESS_1_OF_2";
  if (step === "heardAboutUs") return "WELCOME_CUSTOMIZE_PROGRESS_2_OF_2";
  return null;
}
