import { cn } from "@arclayer/lib/utils";

import type { WelcomeOnboardingStepId } from "../types";

export function OnboardingStepProgress(props: {
  steps: readonly WelcomeOnboardingStepId[];
  currentStep: WelcomeOnboardingStepId;
}) {
  const currentIndex = Math.max(0, props.steps.indexOf(props.currentStep));

  return (
    <div
      className="flex items-center justify-center gap-2"
      aria-label={`Step ${currentIndex + 1} of ${props.steps.length}`}
    >
      {props.steps.map((step, index) => {
        const active = step === props.currentStep;
        const completed = index < currentIndex;

        return (
          <span
            key={step}
            data-testid={`onboarding-progress-step-${index + 1}`}
            data-step-id={step}
            data-state={active ? "active" : completed ? "completed" : "inactive"}
            className={cn(
              "block shrink-0 rounded-full transition-all duration-300",
              active ? "h-2 w-8 bg-secondary" : "size-2 bg-muted-foreground/30",
            )}
          >
            <span className="sr-only">{index + 1}</span>
          </span>
        );
      })}
    </div>
  );
}
