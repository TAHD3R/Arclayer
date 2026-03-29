import type { ReactNode } from "react";

import { cn } from "@arclayer/lib/utils";

export type SettingVerticalItemProps = {
  title: ReactNode;
  control: ReactNode;
  description?: ReactNode;
  className?: string;
  titleClassName?: string;
  controlClassName?: string;
  descriptionClassName?: string;
};

export function SettingVerticalItem(props: SettingVerticalItemProps) {
  const hasDescription = props.description !== undefined && props.description !== null;

  return (
    <div className={cn("min-w-0", props.className)}>
      <div className={cn("text-headline font-semibold text-label-primary", props.titleClassName)}>
        {props.title}
      </div>

      <div className={cn("mt-2 min-w-0", props.controlClassName)}>{props.control}</div>

      {hasDescription ? (
        <div className={cn("mt-2 text-callout  text-label-secondary", props.descriptionClassName)}>
          {props.description}
        </div>
      ) : null}
    </div>
  );
}
