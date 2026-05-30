import { ArrowLeftIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";

export function OnboardingStepHeader(props: {
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
        <div data-testid="onboarding-step-copy" className="text-center">
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
