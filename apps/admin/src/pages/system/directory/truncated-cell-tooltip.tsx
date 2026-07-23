import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@arclayer/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@arclayer/ui/tooltip";

function isElementTruncated(element: HTMLElement | null) {
  if (!element) return false;
  return (
    element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1
  );
}

export function TruncatedCellTooltip(props: {
  text: string;
  className?: string;
  tooltipClassName?: string;
}) {
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const contentRef = useRef<HTMLSpanElement | null>(null);
  const [truncated, setTruncated] = useState(false);
  const measure = useCallback(() => {
    setTruncated(isElementTruncated(contentRef.current));
  }, []);

  useLayoutEffect(() => {
    measure();
    const container = containerRef.current;
    if (!container) return;
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [measure, props.text]);

  const content = (
    <span ref={contentRef} className={cn("block min-w-0 max-w-full truncate", props.className)}>
      {props.text}
    </span>
  );

  return (
    <span ref={containerRef} className="block min-w-0 max-w-full">
      {truncated ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild focusTrigger={false}>
              {content}
            </TooltipTrigger>
            <TooltipContent className={cn("max-w-80 break-all", props.tooltipClassName)}>
              {props.text}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        content
      )}
    </span>
  );
}
