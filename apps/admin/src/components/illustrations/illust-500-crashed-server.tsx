import { Bolt, Server, TriangleAlert, X } from "lucide-react";

import type { IllustrationProps } from "./types";
import { IllustrationAnimatedWrapper } from "./illustration-animated-wrapper";

export function Illust500CrashedServer(props: IllustrationProps) {
  return (
    <IllustrationAnimatedWrapper {...props}>
      <div className="relative w-full h-[320px] flex items-center justify-center">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-destructive/5 blur-[120px]" />

        <div className="relative z-10 w-full max-w-[520px] h-[300px]">
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-destructive/5 to-transparent opacity-70" />
          <div className="celestial-illust-anim-pulse absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-destructive shadow-[0_0_15px_color-mix(in_srgb,var(--color-destructive)_60%,transparent)]" />

          <div className="relative z-10 flex h-full items-center justify-center">
            <div className="relative flex size-48 items-center justify-center">
              <div className="absolute inset-0 scale-110 rounded-full bg-destructive/10 blur-xl" />

              <div className="relative z-10">
                <div className="grid grid-cols-3 gap-4">
                  {(["a1", "a2", "a3", "b1", "b2", "b3", "c1", "c2", "c3"] as const).map((k) => {
                    const isCenter = k === "b2";
                    const base =
                      "size-8 rounded backdrop-blur-sm border border-destructive/20 bg-destructive/10";
                    const variants: Record<string, string> = {
                      a1: "translate-y-2 -translate-x-2 rotate-12 bg-destructive/20",
                      a2: "-translate-y-3 blur-[1px]",
                      a3: "translate-x-4 translate-y-1 -rotate-6 bg-destructive/30 border-destructive/30 shadow-lg shadow-destructive/10",
                      b1: "-translate-x-3 scale-90",
                      b2: "bg-destructive text-destructive-foreground shadow-[0_0_20px_color-mix(in_srgb,var(--color-destructive)_45%,transparent)]",
                      b3: "translate-x-3 rotate-45 scale-75 bg-destructive/20",
                      c1: "-translate-x-1 translate-y-4 rotate-12 bg-destructive/40 border-destructive/40",
                      c2: "translate-y-6 scale-50",
                      c3: "translate-x-2 translate-y-2 -rotate-12 bg-destructive/30 blur-[0.5px]",
                    };

                    return (
                      <div
                        key={k}
                        className={[
                          base,
                          variants[k],
                          isCenter ? "celestial-illust-anim-pulse" : null,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {isCenter ? (
                          <div className="flex h-full w-full items-center justify-center">
                            <Server className="size-4" aria-hidden="true" />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div className="absolute left-0 top-1/2 h-[2px] w-full translate-y-4 translate-x-2 bg-destructive/40" />
                <div className="absolute left-10 top-1/3 h-px w-20 -translate-x-4 bg-background/20" />
              </div>

              <TriangleAlert
                className="celestial-illust-anim-bounce absolute right-10 top-0 size-4 text-destructive/60"
                aria-hidden="true"
              />
              <Bolt
                className="absolute bottom-4 left-4 size-3.5 text-destructive/40"
                aria-hidden="true"
              />
              <X
                className="absolute -left-2 top-10 size-3 text-destructive/30"
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      </div>
    </IllustrationAnimatedWrapper>
  );
}
