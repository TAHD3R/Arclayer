import { FileText, HelpCircle } from "lucide-react";

import { cn } from "@/lib/utils";

import type { IllustrationProps } from "./types";
import { IllustrationAnimatedWrapper } from "./illustration-animated-wrapper";

export function Illust404BrokenLink(props: IllustrationProps) {
  return (
    <IllustrationAnimatedWrapper {...props}>
      <div className="relative w-full h-[320px] flex items-center justify-center">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]" />

        <div className="relative z-10 flex w-full items-center justify-center">
          {/* Composition container (top-left scan line, bottom-right magnifier) */}
          <div className="relative h-[240px] w-[340px]">
            {/* Scan line (top-left) — should be hidden under the magnifier lens area */}
            <div className="celestial-illust-anim-scan absolute left-0 top-6 z-20 h-1 w-[320px] rounded-full bg-primary/50 blur-sm shadow-[0_0_15px_color-mix(in_srgb,var(--color-primary)_60%,transparent)]" />

            {/* Document card (top-left) */}
            <div className="absolute left-0 top-0 z-10 h-48 w-64 overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted/20">
              <div
                className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage:
                    "linear-gradient(var(--color-primary) 1px, transparent 1px), linear-gradient(90deg, var(--color-primary) 1px, transparent 1px)",
                  backgroundSize: "20px 20px",
                }}
              />

              <div className="absolute inset-0 flex items-center justify-center">
                <FileText className="size-14 text-label-secondary/50" aria-hidden="true" />
              </div>
              <HelpCircle
                className="absolute left-1/2 top-1/2 size-9 translate-x-4 -translate-y-4 text-label-secondary/50"
                aria-hidden="true"
              />
            </div>

            {/* Magnifier lens (bottom-right), overlapping document.
                Lens should occlude the scan line (no scan line visible inside lens). */}
            <div
              className={cn(
                "celestial-illust-anim-float pointer-events-none absolute bottom-0 right-0 z-30 size-48",
              )}
            >
              {/* Base lens — keep it opaque so the scan line never bleeds through. */}
              <div className="absolute inset-0 rounded-full border-[6px] border-primary/20 bg-background shadow-xl shadow-primary/10" />

              {/* Glass texture (no backdrop-filter) */}
              <div
                className="absolute inset-0 rounded-full opacity-45"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 32% 26%, rgba(255,255,255,0.42), rgba(255,255,255,0) 58%), radial-gradient(circle at 60% 65%, color-mix(in srgb, var(--color-primary) 10%, transparent), transparent 62%)",
                }}
              />
              <div
                className="absolute inset-0 rounded-full opacity-28"
                style={{
                  backgroundImage:
                    "linear-gradient(135deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 46%, rgba(255,255,255,0.10) 100%)",
                }}
              />
              <div className="absolute inset-3 rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]" />

              <div className="absolute inset-2 rounded-full border border-background/40" />

              {/* Handle */}
              <div className="absolute -bottom-8 -right-8 h-6 w-24 -rotate-45 rounded-full border border-background bg-gradient-to-r from-border to-border/70 shadow-lg" />

              {/* Specular highlight */}
              <div className="absolute left-6 top-4 h-6 w-12 -rotate-[20deg] rounded-full bg-background/40 blur-[2px]" />
            </div>

            {/* Ambient particles + label */}
            <div className="celestial-illust-anim-pulse absolute left-10 top-10 size-2 rounded-full bg-primary" />
            <div
              className="celestial-illust-anim-pulse absolute bottom-20 right-10 size-3 rounded-full bg-primary/30"
              style={{ animationDuration: "4s" }}
            />
          </div>
        </div>
      </div>
    </IllustrationAnimatedWrapper>
  );
}
