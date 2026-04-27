import { useEffect, useRef, type RefObject } from "react";

import { cn } from "@arclayer/lib/utils";
import { Textarea } from "@arclayer/ui/textarea";

type ProjectInlineNameEditorProps = {
  editing: boolean;
  value: string;
  draftValue: string;
  ariaLabel: string;
  maxLength: number;
  counterPlacement?: "below" | "suffix";
  className?: string;
  containerClassName?: string;
  inputClassName?: string;
  counterClassName?: string;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  emptyFallback?: string;
  onDraftChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
};

export function ProjectInlineNameEditor(props: ProjectInlineNameEditorProps) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const showSuffixCounter = props.counterPlacement === "suffix" && !props.multiline;

  useEffect(() => {
    if (!props.editing) return;
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [props.editing]);

  if (!props.editing) {
    const content = props.value || props.emptyFallback || "";
    return <span className={props.className}>{content}</span>;
  }

  const sharedInputClassName = cn(
    "min-w-0 rounded-sm border border-border/70 bg-background px-2 py-1 text-label-primary outline-none",
    showSuffixCounter && "pr-14",
    props.inputClassName,
  );

  return (
    <div className={cn("min-w-0", props.containerClassName)}>
      {props.multiline ? (
        <Textarea
          ref={inputRef as RefObject<HTMLTextAreaElement>}
          value={props.draftValue}
          rows={props.rows ?? 3}
          maxLength={props.maxLength}
          aria-label={props.ariaLabel}
          placeholder={props.placeholder}
          onChange={(event) => props.onDraftChange(event.target.value)}
          onBlur={props.onCommit}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              props.onCommit();
            }

            if (event.key === "Escape") {
              event.preventDefault();
              props.onCancel();
            }
          }}
          className={cn("resize-none", sharedInputClassName)}
        />
      ) : (
        <div className="relative">
          <input
            ref={inputRef as RefObject<HTMLInputElement>}
            value={props.draftValue}
            maxLength={props.maxLength}
            aria-label={props.ariaLabel}
            placeholder={props.placeholder}
            onChange={(event) => props.onDraftChange(event.target.value)}
            onBlur={props.onCommit}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                props.onCommit();
              }

              if (event.key === "Escape") {
                event.preventDefault();
                props.onCancel();
              }
            }}
            className={cn("w-full", sharedInputClassName)}
          />
          {showSuffixCounter ? (
            <span
              className={cn(
                "pointer-events-none absolute inset-y-0 right-2 inline-flex items-center text-[11px] leading-none text-label-secondary",
                props.counterClassName,
              )}
            >
              {props.draftValue.length}/{props.maxLength}
            </span>
          ) : null}
        </div>
      )}
      {showSuffixCounter ? null : (
        <div
          className={cn(
            "mt-1 text-right text-caption text-label-secondary",
            props.counterClassName,
          )}
        >
          {props.draftValue.length}/{props.maxLength}
        </div>
      )}
    </div>
  );
}
