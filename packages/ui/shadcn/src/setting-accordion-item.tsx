import { type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { AccordionContent, AccordionItem, AccordionTrigger } from "@celestial/ui/accordion";
import { cn } from "@celestial/lib/utils";
import { Button } from "./button";

const DEFAULT_TITLE_COLUMN_WIDTH_PX = 240;

export type SettingAccordionItemProps = {
  value: string;
  title: ReactNode;
  description?: ReactNode;
  /**
   * Trigger UI variant.
   * - default: accordion-style (current behavior)
   * - action: SettingActionItem-like row, but keeps accordion expand/collapse logic
   */
  variant?: "default" | "action";
  /** When variant=action, controls trigger title column width (px). */
  titleColumnWidth?: number;
  /** When variant=action, whether to show chevron (default true). */
  showChevron?: boolean;
  /** When variant=action, optional placeholder when summary is empty. */
  placeholder?: ReactNode;
  /** Extra class applied to AccordionItem (e.g. border-0). */
  itemClassName?: string;
  /** Extra class applied to trigger root. */
  triggerClassName?: string;

  /**
   * Optional summary shown in the trigger area so users can see current value
   * without expanding the accordion.
   */
  showSummary?: boolean;
  summary?: ReactNode;
  summaryPrefix?: ReactNode;

  /**
   * Main content (inputs/selectors/custom UI). Keep it generic for future field types.
   */
  children: ReactNode;

  /**
   * Confirm/save action. If onConfirm is not provided, no action buttons are rendered.
   */
  confirmText?: ReactNode;
  onConfirm?: () => void | Promise<void>;
  confirmLoading?: boolean;

  /**
   * Optional reset action.
   */
  resetText?: ReactNode;
  onReset?: () => void | Promise<void>;
  resetLoading?: boolean;

  /**
   * When disabled or busy, block interactions inside content.
   */
  disabled?: boolean;

  /**
   * Content container width control. Defaults to a left-aligned, non-stretch layout.
   */
  contentClassName?: string;

  /**
   * When true, keeps content mounted even when collapsed.
   * Useful for form libraries that expect fields to stay registered while hidden.
   */
  keepRendered?: boolean;
};

export function SettingAccordionItem(props: SettingAccordionItemProps) {
  const hasActions = Boolean(props.onConfirm || props.onReset);
  const busy = Boolean(props.disabled || props.confirmLoading || props.resetLoading);
  const shouldShowSummary = Boolean(props.showSummary);
  const hasDescription = props.description !== undefined && props.description !== null;
  const variant = props.variant ?? "default";
  const showChevron = props.showChevron ?? true;
  const titleColumnWidth = props.titleColumnWidth ?? DEFAULT_TITLE_COLUMN_WIDTH_PX;

  if (props.onConfirm && (props.confirmText === undefined || props.confirmText === null)) {
    throw new Error("SettingAccordionItem: confirmText is required when onConfirm is provided.");
  }
  if (props.onReset && (props.resetText === undefined || props.resetText === null)) {
    throw new Error("SettingAccordionItem: resetText is required when onReset is provided.");
  }

  const hasSummaryValue = (() => {
    const v = props.summary;
    if (v === undefined || v === null) return false;
    if (typeof v === "string") {
      const s = v.trim();
      // Treat "-" as an "empty placeholder" to avoid noisy "Current: -" UX.
      if (!s || s === "-") return false;
    }
    return true;
  })();

  const shouldRenderSummary = shouldShowSummary && hasSummaryValue;
  const summaryNode = shouldRenderSummary ? <span>{props.summary}</span> : null;
  const placeholderNode =
    !shouldRenderSummary && props.placeholder !== undefined && props.placeholder !== null ? (
      <span className="text-label-secondary font-normal">{props.placeholder}</span>
    ) : null;
  const primaryValueNode = summaryNode ?? placeholderNode;

  return (
    <AccordionItem value={props.value} className={props.itemClassName}>
      {variant === "action" ? (
        <AccordionTrigger
          showArrow={false}
          disabled={busy}
          className={cn(
            "group py-0 hover:no-underline",
            // Let container (e.g. SettingPanel card) control rounding.
            "rounded-none",
            "transition-colors",
            "hover:bg-muted",
            "active:bg-muted/70 active:translate-y-px",
            "disabled:pointer-events-none disabled:opacity-60",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
            props.triggerClassName,
          )}
        >
          <div
            className="grid w-full items-start gap-4 px-4 py-4"
            style={{
              gridTemplateColumns: showChevron
                ? `${titleColumnWidth}px 1fr auto`
                : `${titleColumnWidth}px 1fr`,
            }}
          >
            <div className="text-headline text-label-primary">{props.title}</div>
            <div className="min-w-0">
              <div className="text-headline text-label-primary">{primaryValueNode}</div>
              {hasDescription ? (
                <div className="mt-1 text-callout text-label-secondary">{props.description}</div>
              ) : null}
              {shouldRenderSummary ? (
                <div className="sr-only">
                  {props.summaryPrefix ? <>{props.summaryPrefix} </> : null}
                  {summaryNode}
                </div>
              ) : null}
            </div>
            {showChevron ? (
              <div className="pt-1 text-label-secondary">
                <ChevronRight
                  className={cn(
                    "size-5 transition-transform duration-200",
                    "group-data-[state=open]:rotate-90",
                  )}
                  aria-hidden="true"
                />
              </div>
            ) : null}
          </div>
        </AccordionTrigger>
      ) : (
        // Override default trigger hover underline: only underline the title, not the whole block.
        <AccordionTrigger
          disabled={busy}
          className={cn("group hover:no-underline", props.triggerClassName)}
        >
          <div className="flex flex-col gap-1">
            <div className="text-title3 font-bold leading-tight">
              <span className="group-hover:underline underline-offset-4">{props.title}</span>
            </div>
            {hasDescription || shouldRenderSummary ? (
              <div className="text-label-secondary leading-snug no-underline font-normal">
                {hasDescription ? props.description : null}
                {shouldRenderSummary ? (
                  <>
                    {props.summaryPrefix ? (
                      <span className={cn(hasDescription ? "ml-2" : undefined, "mr-1")}>
                        {props.summaryPrefix}
                      </span>
                    ) : null}
                    <span>{props.summary}</span>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </AccordionTrigger>
      )}
      <AccordionContent keepRendered={props.keepRendered}>
        <div
          className={cn("flex w-full max-w-[32.5rem] flex-col gap-3 p-2", props.contentClassName)}
        >
          <fieldset
            disabled={busy}
            className={cn("m-0 min-w-0 border-0 p-0", busy ? "opacity-60" : undefined)}
          >
            {props.children}
          </fieldset>

          {hasActions ? (
            <div className="flex items-center justify-start gap-2">
              {props.onConfirm ? (
                <Button
                  disabled={Boolean(props.disabled || props.resetLoading || props.confirmLoading)}
                  onClick={() => void props.onConfirm?.()}
                  variant="default"
                  loading={Boolean(props.confirmLoading)}
                >
                  {props.confirmText}
                </Button>
              ) : null}
              {props.onReset ? (
                <Button
                  disabled={Boolean(props.disabled || props.confirmLoading || props.resetLoading)}
                  onClick={() => void props.onReset?.()}
                  variant="outline"
                  loading={Boolean(props.resetLoading)}
                >
                  {props.resetText}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
