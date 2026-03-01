import { LockKeyhole, Shield } from "lucide-react";

import type { IllustrationProps } from "./types";
import { IllustrationAnimatedWrapper } from "./illustration-animated-wrapper";

export function Illust403ForbiddenGateway(props: IllustrationProps) {
  return (
    <IllustrationAnimatedWrapper {...props}>
      <div className="relative w-full h-[320px] flex items-center justify-center">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-destructive/5 blur-[120px]" />

        <div className="relative z-10 w-full max-w-[520px] h-[300px]">
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-destructive/5 to-transparent opacity-70" />
          <div className="celestial-illust-anim-scan absolute inset-0 h-[200%] w-full bg-gradient-to-b from-transparent via-destructive/10 to-transparent opacity-70" />

          <div className="relative z-10 flex h-full items-center justify-center">
            <div className="relative flex size-48 items-center justify-center">
              <div className="absolute inset-0 scale-95 rounded-lg bg-destructive/10 blur-md" />
              <div className="celestial-illust-anim-pulse absolute inset-0 scale-90 rounded-lg bg-destructive/5 blur-sm" />

              <div className="relative z-10 grid grid-cols-3 gap-2 overflow-hidden rounded-lg border border-border bg-background/40 p-4 shadow-lg backdrop-blur-sm">
                <div
                  className="absolute inset-0 z-20 opacity-25"
                  style={{
                    background:
                      "repeating-linear-gradient(45deg, transparent, transparent 10px, color-mix(in srgb, var(--color-destructive) 40%, transparent) 10px, color-mix(in srgb, var(--color-destructive) 40%, transparent) 12px)",
                  }}
                />

                {(["tl", "tm", "tr", "ml", "mm", "mr", "bl", "bm", "br"] as const).map((pos) => {
                  const isCenter = pos === "mm";
                  return (
                    <div
                      key={pos}
                      className={
                        isCenter
                          ? "relative z-30 flex size-8 items-center justify-center rounded bg-destructive text-destructive-foreground shadow-[0_0_15px_color-mix(in_srgb,var(--color-destructive)_55%,transparent)]"
                          : "relative z-10 size-8 rounded border border-border bg-background/30"
                      }
                    >
                      {isCenter ? <LockKeyhole className="size-4" aria-hidden="true" /> : null}
                    </div>
                  );
                })}
              </div>

              <div className="celestial-illust-anim-bounce absolute -right-6 -top-6 z-20 flex size-10 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lg shadow-destructive/30">
                <span className="text-sm font-bold leading-none">!</span>
              </div>

              <div className="absolute left-1/2 top-1/2 h-0.5 w-[120%] -translate-x-1/2 -translate-y-1/2 bg-destructive/70 blur-[1px] shadow-[0_0_10px_color-mix(in_srgb,var(--color-destructive)_60%,transparent)]" />
              <Shield
                className="absolute -bottom-8 -left-8 size-8 text-destructive/20"
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      </div>
    </IllustrationAnimatedWrapper>
  );
}
