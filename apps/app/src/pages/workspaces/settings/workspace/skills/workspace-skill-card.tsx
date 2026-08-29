import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

export function WorkspaceSkillCardGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

export function WorkspaceSkillCard(
  props: Readonly<{
    action?: ReactNode;
    description: string;
    icon: ReactNode;
    meta?: ReactNode;
    onSelect: () => void;
    title: string;
  }>,
) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary/40">
      {props.action ? <div className="absolute right-5 top-5 z-10">{props.action}</div> : null}
      <button
        type="button"
        onClick={props.onSelect}
        className="flex flex-1 cursor-pointer flex-col p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border bg-muted/50 text-label-secondary [&_svg]:size-5">
          {props.icon}
        </span>
        <span className="mt-4 truncate pr-20 text-body font-semibold text-label-primary">
          {props.title}
        </span>
        <span className="mt-1.5 line-clamp-3 text-caption leading-5 text-label-secondary">
          {props.description}
        </span>
        {props.meta ? (
          <span className="mt-auto inline-flex min-w-0 items-center gap-1.5 pt-5 text-caption text-label-tertiary">
            <Sparkles aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="min-w-0 truncate">{props.meta}</span>
          </span>
        ) : null}
      </button>
    </div>
  );
}
