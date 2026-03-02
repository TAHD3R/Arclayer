import { UserRound } from "lucide-react";

import { cn } from "@/lib/utils";

import type { IllustrationProps } from "./types";
import { IllustrationAnimatedWrapper } from "./illustration-animated-wrapper";

export function Illust401LockedTerminal(props: IllustrationProps) {
  return (
    <IllustrationAnimatedWrapper {...props}>
      <div className="relative w-full h-[320px] flex items-center justify-center">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[100px]" />

        <div className="relative z-10 w-full max-w-[520px] h-[300px] flex items-center justify-center">
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                "radial-gradient(color-mix(in srgb, var(--color-foreground) 65%, transparent) 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
          />

          <div
            className={cn(
              "celestial-illust-anim-spin absolute left-1/2 top-1/2 size-64 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/70",
              "border-dashed opacity-80",
            )}
            style={{ animationDuration: "20s" }}
          />
          <div className="absolute left-1/2 top-1/2 size-52 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/40 opacity-60" />

          <div className="celestial-illust-anim-float relative z-10 flex h-full items-center justify-center">
            <div className="relative flex h-56 w-40 flex-col overflow-hidden rounded-xl border border-border bg-gradient-to-br from-muted/20 to-background p-4 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.12)]">
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-primary/5 to-transparent" />

              <div className="relative z-10 mb-4 flex items-center justify-between">
                <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                  <UserRound className="size-4 text-label-secondary" />
                </div>
                <div className="h-2 w-12 rounded-full bg-muted" />
              </div>

              <div className="relative z-10 space-y-2">
                <div className="h-2 w-full rounded-full bg-muted" />
                <div className="h-2 w-3/4 rounded-full bg-muted" />
                <div className="h-2 w-1/2 rounded-full bg-muted" />
              </div>

              <div className="relative z-10 mt-auto self-center">
                <div className="flex items-center gap-1 rounded-full border border-border bg-muted/40 px-3 py-1">
                  <div className="size-2 rounded-full bg-border" />
                  <span className="text-[8px] font-mono text-label-secondary uppercase tracking-widest">
                    ID-VERIFY
                  </span>
                </div>
              </div>

              <div className="celestial-illust-anim-scan-y absolute left-0 top-0 z-20 h-0.5 w-full bg-primary shadow-[0_0_15px_color-mix(in_srgb,var(--color-primary)_70%,transparent)]" />
              <div className="celestial-illust-anim-scan-y pointer-events-none absolute left-0 top-0 z-10 h-10 w-full bg-gradient-to-b from-primary/20 to-transparent" />
            </div>
          </div>

          <div
            className="celestial-illust-anim-pulse absolute left-1/2 top-1/2 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/10"
            style={{
              borderTopColor: "transparent",
              borderLeftColor: "transparent",
              transform: "translate(-50%, -50%) rotate(45deg)",
            }}
          />

          <div
            className="celestial-illust-anim-bounce absolute right-20 top-10 size-2 rounded-full bg-primary/25"
            style={{ animationDelay: "1s" }}
          />
          <div
            className="celestial-illust-anim-bounce absolute bottom-10 left-20 size-3 rounded-full bg-border"
            style={{ animationDelay: "2s" }}
          />
        </div>
      </div>
    </IllustrationAnimatedWrapper>
  );
}
