import { unstable_useTriggerPopoverScopeContext } from "@assistant-ui/react";
import { useLayoutEffect, useRef, type ComponentProps } from "react";

import { cn } from "@arclayer/lib/utils";

type AIComposerTriggerScrollAreaProps = ComponentProps<"div">;

export function AIComposerTriggerScrollArea({
  children,
  className,
  ...props
}: AIComposerTriggerScrollAreaProps) {
  const scope = unstable_useTriggerPopoverScopeContext();
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!scope.open || !scope.highlightedItemId) return;
    const scrollRegion = scrollAreaRef.current;
    const highlightedItem = document.getElementById(scope.highlightedItemId);
    if (!scrollRegion || !highlightedItem || !scrollRegion.contains(highlightedItem)) return;

    const viewportRect = scrollRegion.getBoundingClientRect();
    const itemRect = highlightedItem.getBoundingClientRect();
    const overflowTop = itemRect.top - viewportRect.top;
    const overflowBottom = itemRect.bottom - viewportRect.bottom;
    if (overflowTop < 0) scrollRegion.scrollTop += overflowTop;
    else if (overflowBottom > 0) scrollRegion.scrollTop += overflowBottom;
  }, [scope.highlightedItemId, scope.open]);

  return (
    <div
      {...props}
      ref={scrollAreaRef}
      data-slot="composer-trigger-scroll-region"
      className={cn("min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain", className)}
    >
      {children}
    </div>
  );
}
