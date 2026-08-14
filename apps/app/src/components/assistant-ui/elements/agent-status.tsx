"use client";

import { CheckIcon, PauseIcon, RotateCcwIcon } from "lucide-react";
import { cn } from "@arclayer/lib/utils";
import { DotMatrix } from "../dot-matrix";
import { ghostButton, mono, paper } from "./surfaces";

export type AgentState = "working" | "waiting" | "done";

export interface StatusStep {
  state: AgentState;
  label: string;
}

export function AgentStatus({
  state,
  label,
  elapsed,
  actionLabel,
  onAction,
  className,
}: {
  state: AgentState;
  label: string;
  elapsed?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        paper,
        "flex items-center gap-2.5 rounded-full py-1.5 ps-3.5 pe-1.5",
        className,
      )}
    >
      {state === "done" ? (
        <CheckIcon aria-hidden className="size-3 shrink-0 text-emerald-500" />
      ) : (
        <DotMatrix state={state === "working" ? "loading" : "waiting"} label={label} />
      )}
      <span
        key={label}
        className="fade-in blur-in-[2px] animate-in max-w-44 truncate text-xs duration-300 motion-reduce:animate-none"
      >
        {label}
      </span>
      {elapsed !== undefined && state !== "done" && (
        <span className={cn(mono, "text-foreground/30 tabular-nums")}>{elapsed}</span>
      )}
      {onAction ? (
        <button
          type="button"
          aria-label={actionLabel}
          onClick={onAction}
          className={cn(ghostButton, "size-6")}
        >
          {state === "done" ? (
            <RotateCcwIcon className="size-3" />
          ) : (
            <PauseIcon className="size-3" />
          )}
        </button>
      ) : null}
    </div>
  );
}
