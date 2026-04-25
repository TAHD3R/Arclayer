import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";

type QuestionnaireOption = {
  value: string;
  label: string;
};

export function WorkspaceCustomizationStep(props: {
  substep: 0 | 1;
  selectedTeamType: string | null;
  selectedGoal: string | null;
  teamTypeOptions: QuestionnaireOption[];
  goalOptions: QuestionnaireOption[];
  onTeamTypeChange: (value: string) => void;
  onGoalChange: (value: string) => void;
  onBackToTeamType: () => void;
}) {
  const { t } = useTranslation("onboarding");
  const options = props.substep === 0 ? props.teamTypeOptions : props.goalOptions;
  const selected = props.substep === 0 ? props.selectedTeamType : props.selectedGoal;
  const onSelect = props.substep === 0 ? props.onTeamTypeChange : props.onGoalChange;

  return (
    <div className="flex flex-col gap-4 py-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-title3 text-label-primary">
            {props.substep === 0
              ? t("WELCOME_CUSTOMIZE_TEAM_TYPE_QUESTION")
              : t("WELCOME_CUSTOMIZE_GOAL_QUESTION")}
          </div>
          <div className="mt-1 text-footnote text-label-secondary">
            {props.substep === 0
              ? t("WELCOME_CUSTOMIZE_PROGRESS_1")
              : t("WELCOME_CUSTOMIZE_PROGRESS_2")}
          </div>
        </div>
        {props.substep === 1 ? (
          <Button variant="ghost" className="gap-2" onClick={props.onBackToTeamType}>
            <ArrowLeft className="size-4" />
            {t("WELCOME_CUSTOMIZE_BACK_TO_TEAM_TYPE")}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {options.map((option) => {
          const active = selected === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={
                active
                  ? "min-h-14 rounded-lg border border-primary bg-primary-highlighted px-4 py-2.5 text-left text-callout font-semibold leading-snug text-label-primary"
                  : "min-h-14 rounded-lg border border-border px-4 py-2.5 text-left text-callout font-semibold leading-snug text-label-primary transition-colors hover:bg-muted"
              }
              onClick={() => onSelect(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
