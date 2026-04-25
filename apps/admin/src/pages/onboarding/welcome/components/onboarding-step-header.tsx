import { ArrowLeftIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperTrigger,
} from "@arclayer/ui/stepper";
import type { WelcomeOnboardingStep } from "../types";

const steps: WelcomeOnboardingStep[] = [1, 2, 3, 4];

export function OnboardingStepHeader(props: {
  currentStep: WelcomeOnboardingStep;
  title: string;
  description?: string;
  canGoBack: boolean;
  onBack: () => void;
}) {
  const { t } = useTranslation("common");
  const descriptionParagraphs = props.description?.split(/\n{2,}/).filter(Boolean) ?? [];

  return (
    <div className="w-full">
      <div className="relative">
        {props.canGoBack ? (
          <div className="absolute top-10 -left-12">
            <Button variant="ghost" size="icon-lg" aria-label={t("BACK")} onClick={props.onBack}>
              <ArrowLeftIcon className="size-5" />
            </Button>
          </div>
        ) : null}
        <Stepper value={props.currentStep} className="-mt-1 mb-5 w-32 sm:w-40">
          <StepperNav className="h-1 gap-1">
            {steps.map((step) => (
              <StepperItem
                key={step}
                step={step}
                className="first:rounded-s-full last:rounded-e-full flex-1 overflow-hidden transition-all duration-300"
              >
                <StepperTrigger className="h-full w-full flex-col items-start gap-0" asChild>
                  <StepperIndicator className="h-1 w-full rounded-none border-0 bg-border data-[state=active]:bg-primary data-[state=completed]:bg-primary">
                    <span className="sr-only">{step}</span>
                  </StepperIndicator>
                </StepperTrigger>
              </StepperItem>
            ))}
          </StepperNav>
        </Stepper>
        <div>
          <h1 className="text-title text-label-primary">{props.title}</h1>
          {descriptionParagraphs.length > 0 ? (
            <div className="mt-3 space-y-3">
              {descriptionParagraphs.map((paragraph) => (
                <p key={paragraph} className="text-body text-label-secondary">
                  {paragraph}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
