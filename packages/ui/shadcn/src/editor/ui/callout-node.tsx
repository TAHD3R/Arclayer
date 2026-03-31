"use client";

import { LightbulbIcon } from "lucide-react";
import { PlateElement } from "platejs/react";

import { cn } from "@arclayer/lib/utils";

export function CalloutElement({ className, ...props }: React.ComponentProps<typeof PlateElement>) {
  return (
    <PlateElement
      {...props}
      className={cn(
        "my-4 flex rounded-md border border-border/70 bg-muted/30 px-4 py-3",
        className,
      )}
      style={{
        backgroundColor: props.element.backgroundColor as string | undefined,
      }}
      attributes={{
        ...props.attributes,
        "data-plate-open-context-menu": true,
      }}
    >
      <div className="flex w-full gap-3">
        <div
          className="flex size-7 shrink-0 items-center justify-center rounded-md bg-card/70 text-label-secondary"
          contentEditable={false}
        >
          {typeof props.element.icon === "string" && props.element.icon ? (
            <span>{props.element.icon}</span>
          ) : (
            <LightbulbIcon className="size-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">{props.children}</div>
      </div>
    </PlateElement>
  );
}
