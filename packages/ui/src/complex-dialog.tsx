import { useId, type ReactNode } from "react";
import { X } from "lucide-react";

import { cn } from "@arclayer/lib/utils";

import { Button } from "./button";
import { ExpandableScreen, ExpandableScreenContent } from "./expandable-screen";

export type ComplexDialogSize = "md" | "lg" | "xl" | "full";

export type ComplexDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  headerRight?: ReactNode;
  size?: ComplexDialogSize;
  contentClassName?: string;
  headerClassName?: string;
  headerAlign?: "start" | "center";
  bodyClassName?: string;
  footerClassName?: string;
};

function renderHeaderActions(props: { headerRight?: ReactNode; onClose: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {props.headerRight}
      {props.headerRight ? <div className="mx-1 h-4 w-px bg-border/70" aria-hidden="true" /> : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0"
        aria-label="Close"
        onClick={props.onClose}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

export function ComplexDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  headerRight,
  size: _size = "lg",
  contentClassName,
  headerClassName,
  headerAlign = "start",
  bodyClassName,
  footerClassName,
}: ComplexDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const centeredHeader = headerAlign === "center";
  const hasDescription = Boolean(description);

  return (
    <ExpandableScreen
      expanded={open}
      onExpandChange={onOpenChange}
      layoutId={`complex-dialog-${titleId}`}
    >
      <ExpandableScreenContent
        showCloseButton={false}
        className={cn("border border-border/80 bg-background shadow-2xl", contentClassName)}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={hasDescription ? descriptionId : undefined}
          className="flex h-full min-h-0 flex-col"
        >
          <div
            className={cn(
              "flex items-start gap-4 border-b border-border/70 px-6 py-4 sm:px-8 sm:py-5",
              headerClassName,
            )}
          >
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "min-w-0",
                  centeredHeader
                    ? "mx-auto flex max-w-3xl flex-col items-center text-center"
                    : null,
                )}
              >
                <h2
                  id={titleId}
                  className={cn(
                    "min-w-0 text-title font-semibold text-label-primary",
                    centeredHeader ? "w-full text-center" : null,
                  )}
                >
                  {title}
                </h2>
                {description ? (
                  <p
                    id={descriptionId}
                    className={cn(
                      "mt-2 text-body text-label-secondary",
                      centeredHeader ? "max-w-2xl text-center" : null,
                    )}
                  >
                    {description}
                  </p>
                ) : null}
              </div>
            </div>
            {renderHeaderActions({
              headerRight,
              onClose: () => onOpenChange(false),
            })}
          </div>

          <div className={cn("min-h-0 flex-1 overflow-auto px-6 py-6 sm:px-8", bodyClassName)}>
            {children}
          </div>

          {footer ? (
            <div
              className={cn("mt-0 border-t border-border/70 px-6 py-5 sm:px-8", footerClassName)}
            >
              {footer}
            </div>
          ) : null}
        </div>
      </ExpandableScreenContent>
    </ExpandableScreen>
  );
}
