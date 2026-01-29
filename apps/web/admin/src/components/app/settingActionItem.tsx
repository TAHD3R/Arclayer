import { type ReactNode, useMemo, useState } from "react";

import ChevronRightIcon from "@/components/ui/icons/chevron-right";
import { cn } from "@/lib/utils";

type Description = ReactNode | string | string[] | undefined | null;

export type SettingActionItemProps = {
  title: ReactNode;
  summary?: ReactNode;
  placeholder?: ReactNode;
  description?: Description;
  disabled?: boolean;
  onTrigger?: () => void;
  className?: string;
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

  const summaryNode =
    props.summary !== undefined && props.summary !== null ? (
      <div className="text-[16px] font-semibold leading-snug text-foreground">{props.summary}</div>
    ) : (
      <div className="text-[16px] leading-snug text-muted-foreground">
        {props.placeholder ?? "-"}
      </div>
    );

  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={() => props.onTrigger?.()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "w-full text-left",
        "transition-colors",
        "hover:bg-muted",
        "active:bg-muted/70 active:translate-y-px",
        "disabled:pointer-events-none disabled:opacity-60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
        props.className,
      )}
    >
      <div className="grid grid-cols-[240px_1fr_auto] items-start gap-4 px-4 py-4">
        <div className="text-[16px] font-medium leading-snug">{props.title}</div>
        <div className="min-w-0">
          {summaryNode}
          {desc ? <div className="mt-1 text-[16px] text-muted-foreground">{desc}</div> : null}
        </div>
        <div className="pt-1 text-muted-foreground">
          <ChevronRightIcon size={18} strokeWidth={2} isHovered={hovered} />
        </div>
      </div>
    </button>
  );
}
