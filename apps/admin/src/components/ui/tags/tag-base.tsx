import type { CSSProperties, HTMLAttributes, MouseEventHandler, ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";

import { cn } from "@arclayer/lib/utils";

const TAG_ICON_SIZE_PX = 12;
const TAG_TEXT_STYLE_CLASSNAMES = {
  caption: "text-caption",
  footnote: "text-footnote",
} as const;

export const TAG_BASE_ROOT_CLASSNAME =
  "inline-flex min-w-0 max-w-full shrink items-center overflow-hidden rounded-sm border border-border px-2 py-1 font-semibold whitespace-nowrap ";

type TagSemanticClassNames = {
  root?: string;
  icon?: string;
  content?: string;
};

export type BaseTagColor = "default" | "green" | "blue" | "red" | "gold" | "error";
export type BaseTagTextStyle = keyof typeof TAG_TEXT_STYLE_CLASSNAMES;

export type TagPresentationProps = {
  className?: string;
  style?: CSSProperties;
  textStyle?: BaseTagTextStyle;
};

type BaseTagProps = HTMLAttributes<HTMLSpanElement> &
  TagPresentationProps & {
    children?: ReactNode;
    classNames?: TagSemanticClassNames;
    closable?: boolean;
    color?: BaseTagColor;
    icon?: ReactNode;
    onClose?: MouseEventHandler<HTMLElement>;
  };

function mergeTagClassNames(
  overrides: TagSemanticClassNames | undefined,
  textStyle: BaseTagTextStyle,
): TagSemanticClassNames {
  return {
    root: cn(TAG_BASE_ROOT_CLASSNAME, overrides?.root),
    icon: cn("inline-flex shrink-0 items-center ", overrides?.icon),
    content: cn(
      "inline-flex min-w-0 max-w-full flex-1 items-center gap-1 overflow-hidden font-semibold!",
      TAG_TEXT_STYLE_CLASSNAMES[textStyle],
      overrides?.content,
    ),
  };
}

function getColorClassName(color: BaseTagColor | undefined): string {
  switch (color) {
    case "green":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300";
    case "blue":
      return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-300";
    case "red":
    case "error":
      return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300";
    case "gold":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300";
    case "default":
    default:
      return "border-border bg-muted/55 text-label-primary";
  }
}

export function lucideTagIcon(Icon: LucideIcon, className?: string): ReactNode {
  return <Icon size={TAG_ICON_SIZE_PX} className={cn("shrink-0", className)} />;
}

export function BaseTag({
  classNames,
  color = "default",
  icon,
  children,
  closable,
  onClose,
  className,
  style,
  textStyle = "caption",
  ...props
}: BaseTagProps) {
  const mergedClassNames = mergeTagClassNames(classNames, textStyle);

  return (
    <span
      className={cn(mergedClassNames.root, getColorClassName(color), className)}
      style={style}
      {...props}
    >
      <span className={mergedClassNames.content}>
        {icon ? <span className={mergedClassNames.icon}>{icon}</span> : null}
        <span className="block min-w-0 max-w-full flex-1 truncate">
          {children}
        </span>
      </span>
      {closable ? (
        <button
          type="button"
          className="ml-1 inline-flex size-4 shrink-0 items-center justify-center rounded-sm opacity-70 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
          onClick={(event) => {
            onClose?.(event);
          }}
          aria-label="Remove tag"
        >
          <X size={12} />
        </button>
      ) : null}
    </span>
  );
}
