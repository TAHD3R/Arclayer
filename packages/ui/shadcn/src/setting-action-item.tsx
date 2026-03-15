import { type ReactNode, useMemo, useState } from "react";

import ChevronRightIcon from "@celestial/ui/icons/chevron-right";
import { Button as ButtonPrimitive } from "@celestial/ui/button-primitive";
import { cn } from "@celestial/lib/utils";

type Description = ReactNode | string | string[] | undefined | null;

export type SettingActionItemProps = {
  as?: "button" | "div";
  title: ReactNode;
  showSummary?: boolean;
  summary?: ReactNode;
  placeholder?: ReactNode;
  description?: Description;
  disabled?: boolean;
  onTrigger?: () => void;
  className?: string;
  /** Title column width in px. Defaults to 240 for settings pages. */
  titleColumnWidth?: number;
  /** Whether to show the chevron on the right side. Defaults to true. */
  showChevron?: boolean;
  /** Custom right-side content (for example switch, badge, or button group). */
  right?: ReactNode;
  /** Optional class override for summary text styles. */
  summaryClassName?: string;
  /** Optional class override for title text styles. */
  titleClassName?: string;
};

function normalizeDescription(desc: Description): ReactNode {
  if (desc === undefined || desc === null) return null;
  if (Array.isArray(desc)) {
    const items = desc.filter(Boolean);
    if (!items.length) return null;
    return (
      <div className="flex flex-col gap-1">
        {items.map((item, idx) => (
          <div key={idx} className="leading-snug">
            <span className="mr-1">·</span>
            <span>{item}</span>
          </div>
        ))}
      </div>
    );
  }
  return <div className="leading-snug">{desc}</div>;
}

export function SettingActionItem(props: SettingActionItemProps) {
  const [hovered, setHovered] = useState(false);
  const desc = useMemo(() => normalizeDescription(props.description), [props.description]);
  const titleColumnWidth = props.titleColumnWidth ?? 240;
  const showChevron = props.showChevron ?? true;
  const showSummary = props.showSummary ?? true;
  const as = props.as ?? "button";
  const hasRight = props.right !== undefined && props.right !== null;
  const hasThirdColumn = showChevron || hasRight;

  const summaryNode = showSummary ? (
    props.summary !== undefined && props.summary !== null ? (
      <div className={cn("text-headline text-label-primary", props.summaryClassName)}>
        {props.summary}
      </div>
    ) : (
      <div className={cn("text-callout text-label-secondary", props.summaryClassName)}>
        {props.placeholder ?? "-"}
      </div>
    )
  ) : null;

  const inner = (
    <div
      className="grid items-start gap-4 px-4 py-4"
      style={{
        gridTemplateColumns: hasThirdColumn
          ? `${titleColumnWidth}px 1fr auto`
          : `${titleColumnWidth}px 1fr`,
      }}
    >
      <div className={cn("text-headline font-semibold text-label-primary", props.titleClassName)}>
        {props.title}
      </div>
      <div className="min-w-0">
        {summaryNode}
        {desc ? (
          <div
            className={cn(summaryNode ? "mt-1" : undefined, "text-callout text-label-secondary")}
          >
            {desc}
          </div>
        ) : null}
      </div>
      {hasThirdColumn ? (
        <div
          className={cn(
            "text-label-secondary",
            hasRight ? "flex items-center justify-end gap-2" : "pt-1",
          )}
        >
          {hasRight ? props.right : null}
          {showChevron ? <ChevronRightIcon size={18} strokeWidth={2} isHovered={hovered} /> : null}
        </div>
      ) : null}
    </div>
  );

  if (as === "div") {
    return (
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "w-full text-left",
          "transition-colors",
          "hover:bg-muted",
          "first:rounded-t-lg last:rounded-b-lg",
          props.className,
        )}
      >
        {inner}
      </div>
    );
  }

  return (
    <ButtonPrimitive
      type="button"
      disabled={props.disabled}
      onClick={() => props.onTrigger?.()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      tapScale={1}
      className={cn(
        "w-full text-left",
        "transition-colors",
        "hover:bg-muted",
        "first:rounded-t-lg last:rounded-b-lg",
        "active:bg-muted/70 active:translate-y-px",
        "disabled:pointer-events-none disabled:opacity-60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
        props.className,
      )}
    >
      {inner}
    </ButtonPrimitive>
  );
}
