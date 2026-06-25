import { ChevronRightIcon } from "lucide-react";

import { Button } from "@arclayer/ui/button";

export function HomeSectionHeader(props: {
  title: string;
  actionLabel: string;
  titleId: string;
  testId?: string;
  onAction: () => void;
}) {
  return (
    <div
      className="relative mb-4 flex w-full items-center justify-between gap-4"
      data-testid={props.testId}
    >
      <h2 id={props.titleId} className="text-title2 text-label-primary">
        {props.title}
      </h2>
      <Button
        type="button"
        variant="ghost"
        className="shrink-0 px-2 text-label-secondary hover:text-label-primary"
        onClick={props.onAction}
      >
        {props.actionLabel}
        <ChevronRightIcon className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
