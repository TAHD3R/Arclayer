import { Gauge } from "lucide-react";

import type { IllustrationProps } from "./types";
import { IllustrationAnimatedWrapper } from "./illustration-animated-wrapper";

export function Illust429OverloadedGauge(props: IllustrationProps) {
  return (
    <IllustrationAnimatedWrapper {...props}>
      <div className="relative w-full h-[320px] flex items-center justify-center">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[100px]" />

        <div className="relative z-10 flex w-full items-center justify-center">
          <div className="relative w-full">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="celestial-illust-anim-spin size-64 rounded-full border border-primary/20 border-dashed opacity-70" />
              <div
                className="celestial-illust-anim-spin absolute size-48 rounded-full border border-primary/30 border-dotted opacity-70"
                style={{ animationDirection: "reverse", animationDuration: "15s" }}
              />
              <div className="absolute bottom-10 h-24 w-48 rounded-full bg-gradient-to-t from-primary/10 to-transparent blur-sm [transform:perspective(1000px)_rotateX(60deg)]" />
            </div>

            <div className="celestial-illust-anim-float relative z-10 flex items-center justify-center">
              <div className="relative">
                <svg className="h-32 w-32 overflow-visible" viewBox="0 0 100 100">
                  <path
                    d="M 10 50 A 40 40 0 1 1 90 50"
                    fill="none"
                    stroke="var(--color-muted)"
                    strokeLinecap="round"
                    strokeWidth="8"
                    opacity="0.65"
                  />
                  <path
                    d="M 10 50 A 40 40 0 1 1 90 50"
                    fill="none"
                    stroke="var(--color-primary)"
                    strokeDasharray="126"
                    strokeDashoffset="10"
                    strokeLinecap="round"
                    strokeWidth="8"
                    className="celestial-illust-anim-pulse"
                    opacity="0.9"
                  />

                  <g
                    className="celestial-illust-anim-pulse"
                    style={{
                      transformOrigin: "50px 50px",
                      transform: "rotate(120deg)",
                    }}
                  >
                    <rect
                      x="48"
                      y="50"
                      width="4"
                      height="40"
                      rx="2"
                      fill="var(--color-background)"
                      opacity="0.9"
                    />
                    <circle cx="50" cy="50" r="6" fill="var(--color-primary)" />
                  </g>
                </svg>

                <div className="celestial-illust-anim-pulse absolute left-1/2 top-1/2 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-xl" />

                <div className="celestial-illust-anim-bounce absolute -right-4 -top-4 flex items-center justify-center rounded-full border border-primary/50 bg-background/80 p-1.5 text-primary shadow-[0_0_15px_color-mix(in_srgb,var(--color-primary)_35%,transparent)]">
                  <Gauge className="size-4" aria-hidden="true" />
                </div>
              </div>
            </div>

            <div className="pointer-events-none absolute inset-0">
              <div
                className="celestial-illust-anim-ping absolute left-[25%] top-[20%] size-1.5 rounded-full bg-primary opacity-60"
                style={{ animationDuration: "2s" }}
              />
              <div
                className="celestial-illust-anim-ping absolute right-[25%] top-[30%] size-1 rounded-full bg-background opacity-40"
                style={{ animationDuration: "3s", animationDelay: "1s" }}
              />
              <div className="celestial-illust-anim-pulse absolute bottom-[30%] left-[30%] size-2 rounded-full bg-primary/60 blur-[1px]" />

              <svg className="absolute inset-0 h-full w-full opacity-35">
                <path
                  d="M 40,200 Q 120,150 200,180 T 360,150"
                  stroke="var(--color-primary)"
                  strokeDasharray="5,5"
                  strokeWidth="1"
                  fill="none"
                  className="celestial-illust-anim-dash"
                />
                <path
                  d="M 380,100 Q 300,150 240,120 T 120,100"
                  stroke="var(--color-primary)"
                  strokeDasharray="3,7"
                  strokeWidth="1"
                  fill="none"
                  className="celestial-illust-anim-dash"
                  style={{ animationDuration: "4s" }}
                />
                <path
                  d="M 90,80 Q 180,120 240,90"
                  stroke="var(--color-background)"
                  strokeDasharray="2,8"
                  strokeWidth="0.6"
                  fill="none"
                  className="celestial-illust-anim-dash"
                  style={{ animationDuration: "5s" }}
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </IllustrationAnimatedWrapper>
  );
}
