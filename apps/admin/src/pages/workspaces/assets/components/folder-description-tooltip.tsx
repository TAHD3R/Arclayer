import { cn } from "@arclayer/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";
import { useCallback, useEffect, useRef, useState } from "react";

type FolderDescriptionTooltipProps = {
  text?: string | null;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
};

function isTextClamped(element: HTMLDivElement | null) {
  if (!element) return false;
  return element.scrollHeight > element.clientHeight + 1;
}

export function FolderDescriptionTooltip(props: FolderDescriptionTooltipProps) {
  const text = props.text?.trim() || props.emptyText;
  const descriptionRef = useRef<HTMLDivElement | null>(null);
  const [clamped, setClamped] = useState(false);

  const measureClamp = useCallback(() => {
    setClamped(isTextClamped(descriptionRef.current));
  }, []);

  useEffect(() => {
    measureClamp();
    if (typeof ResizeObserver === "undefined") return;
    const element = descriptionRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => measureClamp());
    observer.observe(element);
    return () => observer.disconnect();
  }, [measureClamp, text]);

  if (!text) return null;

  const descriptionNode = (
    <div
      ref={descriptionRef}
      className={cn(
        "min-h-10 text-footnote leading-snug text-label-secondary",
        "line-clamp-2",
        props.className,
      )}
    >
      {text}
    </div>
  );

  if (!clamped || props.disabled) return descriptionNode;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{descriptionNode}</TooltipTrigger>
      <TooltipContent className="max-w-72 text-left">{text}</TooltipContent>
    </Tooltip>
  );
}
