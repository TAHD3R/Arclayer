import {
  BriefcaseBusiness,
  CircleHelp,
  Code2,
  FileText,
  Megaphone,
  Rocket,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@arclayer/lib/utils";

type QuestionnaireOption = {
  value: string;
  label: string;
};

const TEAM_TYPE_ICONS: Record<string, LucideIcon> = {
  agency: BriefcaseBusiness,
  content: FileText,
  developer: Code2,
  founder: Rocket,
  marketing: Megaphone,
  other: CircleHelp,
};

export function WorkspaceCustomizationStep(props: {
  selected: string | null;
  options: QuestionnaireOption[];
  variant: "teamType" | "heardAboutUs";
  onChange: (value: string) => void;
}) {
  const isTeamType = props.variant === "teamType";

  return (
    <div className="flex flex-col gap-4 py-5">
      <div
        data-testid="workspace-customization-options"
        className={cn(
          "grid gap-2.5 sm:grid-cols-2",
          isTeamType ? "lg:grid-cols-3" : "lg:grid-cols-4",
        )}
      >
        {props.options.map((option) => {
          const active = props.selected === option.value;
          const Icon = TEAM_TYPE_ICONS[option.value] ?? CircleHelp;
          if (isTeamType) {
            return (
              <button
                key={option.value}
                type="button"
                data-testid={`team-type-option-${option.value}`}
                className={cn(
                  "flex min-h-32 flex-col justify-between rounded-lg border bg-card p-4 text-left",
                  "transition-colors duration-200 hover:border-border/80 hover:bg-accent/50",
                  active
                    ? "border-primary bg-primary-highlighted"
                    : "border-border text-label-primary",
                )}
                onClick={() => props.onChange(option.value)}
              >
                <span
                  data-testid={`team-type-option-${option.value}-icon`}
                  className={cn(
                    "inline-flex size-10 items-center justify-center rounded-lg border",
                    active
                      ? "border-primary/30 bg-background/70 text-primary"
                      : "border-border bg-muted/50 text-label-secondary",
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="pt-4 text-callout font-semibold text-label-primary">
                  {option.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={option.value}
              type="button"
              className={
                active
                  ? "min-h-14 rounded-lg border border-primary bg-primary-highlighted px-4 py-2.5 text-left text-callout font-semibold text-label-primary"
                  : "min-h-14 rounded-lg border border-border px-4 py-2.5 text-left text-callout font-semibold text-label-primary transition-colors hover:bg-muted"
              }
              onClick={() => props.onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
