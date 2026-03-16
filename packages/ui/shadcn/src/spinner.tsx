import * as React from "react";
import { Loader2Icon } from "lucide-react";

import { cn } from "@arclayer/lib/utils";

const DEFAULT_SPINNER_LABEL = "Loading";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      role="status"
      aria-label={DEFAULT_SPINNER_LABEL}
      className={cn("size-4 animate-spin motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

type SpinnerOverlayProps = React.ComponentProps<"div"> & {
  spinnerClassName?: string;
  spinnerContainerClassName?: string;
  label?: string;
};

function SpinnerOverlay({
  className,
  spinnerClassName,
  spinnerContainerClassName,
  label = DEFAULT_SPINNER_LABEL,
  ...props
}: SpinnerOverlayProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn(
        "pointer-events-none absolute inset-0 z-40 grid place-items-center rounded-[inherit] bg-background/50 backdrop-blur-[1px]",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "inline-flex items-center justify-center rounded-full border border-border/60 bg-card/95 p-2 shadow-sm shadow-black/5",
          spinnerContainerClassName,
        )}
      >
        <Spinner
          aria-hidden="true"
          className={cn("size-4 text-label-secondary", spinnerClassName)}
        />
      </div>
    </div>
  );
}

export { Spinner, SpinnerOverlay };
