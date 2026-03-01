import { AlertTriangle } from "lucide-react";

import type { IllustrationProps } from "./types";
import { IllustrationAnimatedWrapper } from "./illustration-animated-wrapper";

export function Illust422MalformedPacket(props: IllustrationProps) {
  return (
    <IllustrationAnimatedWrapper {...props}>
      <div className="relative w-full h-[320px] flex items-center justify-center [perspective:1000px]">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]" />

        <div className="relative z-10 flex items-center justify-center">
          <div className="relative size-64 [transform-style:preserve-3d]">
            <div className="celestial-illust-anim-scan absolute inset-x-0 top-0 z-20 h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50 blur-[1px]" />
            <div className="celestial-illust-anim-scan pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-primary/10 to-transparent opacity-70" />

            <div className="absolute inset-0 scale-110 rotate-12 rounded-xl border border-primary/20 opacity-30" />
            <div className="absolute inset-0 scale-90 -rotate-6 rounded-xl border border-primary/20 opacity-30" />

            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45 scale-75">
              <div className="grid grid-cols-3 gap-3 drop-shadow-[0_0_15px_color-mix(in_srgb,var(--color-primary)_22%,transparent)]">
                {(["tl", "tm", "tr", "ml", "mm", "mr", "bl", "bm", "br"] as const).map((pos) => {
                  const isCenter = pos === "mm";
                  const shouldFloat =
                    !isCenter && (pos === "tl" || pos === "tm" || pos === "tr" || pos === "bm");
                  const floatStyle =
                    pos === "tm"
                      ? ({ animationDelay: "3s" } as const)
                      : pos === "tr"
                        ? ({ animationDelay: "2.2s" } as const)
                        : pos === "bm"
                          ? ({ animationDelay: "1.2s" } as const)
                          : undefined;

                  return (
                    <div
                      key={pos}
                      className={
                        isCenter
                          ? "relative overflow-hidden rounded-lg border border-destructive/50 bg-destructive/10 shadow-[0_0_20px_color-mix(in_srgb,var(--color-destructive)_25%,transparent)]"
                          : [
                              "rounded-lg border border-primary/40 bg-card/40 shadow-[0_0_10px_inset_color-mix(in_srgb,var(--color-primary)_12%,transparent)]",
                              shouldFloat ? "celestial-illust-anim-float" : null,
                            ]
                              .filter(Boolean)
                              .join(" ")
                      }
                      style={{ width: 48, height: 48, ...floatStyle }}
                    >
                      {isCenter ? (
                        <>
                          <div className="celestial-illust-anim-pulse absolute inset-0 bg-destructive/10" />
                          <div className="absolute right-1 top-1 size-1 rounded-full bg-destructive/70" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <AlertTriangle className="size-4 text-destructive" aria-hidden="true" />
                          </div>
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="celestial-illust-anim-pulse absolute right-10 top-0 size-8 rotate-[15deg] rounded border border-destructive/40 opacity-50" />
            <div className="absolute bottom-4 left-12 h-px w-16 -rotate-[15deg] bg-primary/40" />

            <div className="absolute -right-8 top-1/2 flex -translate-y-1/2 flex-col gap-1">
              <div className="h-[2px] w-8 rounded-full bg-destructive/60" />
              <div className="ml-auto h-[2px] w-5 rounded-full bg-destructive/40" />
            </div>

            <div className="absolute -left-12 top-10 select-none font-mono text-[10px] leading-tight text-primary/35 opacity-70">
              <div>0100101</div>
              <div>ERROR_VAL</div>
              <div>x86_fail</div>
            </div>
          </div>
        </div>
      </div>
    </IllustrationAnimatedWrapper>
  );
}
