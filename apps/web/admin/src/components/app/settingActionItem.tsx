import { type ReactNode, useMemo, useState } from "react";

import ChevronRightIcon from "@/components/ui/icons/chevron-right";
import { cn } from "@/lib/utils";

type Description = ReactNode | string | string[] | undefined | null;

export type SettingActionItemProps = {
  as?: "button" | "div";
  title: ReactNode;
  summary?: ReactNode;
  placeholder?: ReactNode;
  description?: Description;
  disabled?: boolean;
  onTrigger?: () => void;
  className?: string;
  /** 标题列宽度（px）。默认 240，适用于设置页；在“链接/复制”类场景可以调小。 */
  titleColumnWidth?: number;
  /** 右侧箭头是否显示（默认显示）。在“点击复制”类场景可隐藏以节省空间。 */
  showChevron?: boolean;
  /** 右侧自定义内容（例如开关、徽标、按钮组）。 */
  right?: ReactNode;
  /** 覆盖 summary 区域样式（默认是 16px + 半粗）。 */
  summaryClassName?: string;
  /** 覆盖 title 文案样式。 */
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
  const as = props.as ?? "button";
  const hasRight = props.right !== undefined && props.right !== null;
  const hasThirdColumn = showChevron || hasRight;

  const summaryNode =
    props.summary !== undefined && props.summary !== null ? (
      <div
        className={cn(
          "text-[16px] font-semibold leading-snug text-foreground",
          props.summaryClassName,
        )}
      >
        {props.summary}
      </div>
    ) : (
      <div className={cn("text-[16px] leading-snug text-muted-foreground", props.summaryClassName)}>
        {props.placeholder ?? "-"}
      </div>
    );

  const inner = (
    <div
      className="grid items-start gap-4 px-4 py-4"
      style={{
        gridTemplateColumns: hasThirdColumn
          ? `${titleColumnWidth}px 1fr auto`
          : `${titleColumnWidth}px 1fr`,
      }}
    >
      <div className={cn("text-[16px] font-medium leading-snug", props.titleClassName)}>
        {props.title}
      </div>
      <div className="min-w-0">
        {summaryNode}
        {desc ? <div className="mt-1 text-[16px] text-muted-foreground">{desc}</div> : null}
      </div>
      {hasThirdColumn ? (
        <div
          className={cn(
            "text-muted-foreground",
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
        className={cn("w-full text-left", "transition-colors", "hover:bg-muted", props.className)}
      >
        {inner}
      </div>
    );
  }

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
      {inner}
    </button>
  );
}
