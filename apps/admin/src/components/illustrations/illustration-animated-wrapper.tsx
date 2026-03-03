import { cn } from "@celestial/lib/utils";

import type { IllustrationProps } from "./types";
import { useIllustrationAnimation } from "./use-illustration-animation";

type IllustrationAnimatedWrapperProps = IllustrationProps & {
  children: React.ReactNode;
};

export function IllustrationAnimatedWrapper({
  className,
  ariaLabel,
  children,
}: IllustrationAnimatedWrapperProps) {
  const { animate } = useIllustrationAnimation();
  const decorative = !ariaLabel;

  return (
    <div
      data-animate={animate ? "true" : "false"}
      role={decorative ? undefined : "img"}
      aria-label={ariaLabel}
      aria-hidden={decorative ? true : undefined}
      className={cn("celestial-illust-root relative block w-full overflow-visible", className)}
    >
      <style>{`
        @keyframes celestial-illust-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        @keyframes celestial-illust-scan {
          0%, 100% { transform: translateY(-20%); opacity: 0.2; }
          50% { transform: translateY(20%); opacity: 0.6; }
        }

        @keyframes celestial-illust-scan-y {
          0%, 100% { transform: translateY(-120%); opacity: 0.2; }
          50% { transform: translateY(120%); opacity: 0.6; }
        }

        @keyframes celestial-illust-spin {
          to { transform: rotate(360deg); }
        }

        @keyframes celestial-illust-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }

        @keyframes celestial-illust-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }

        @keyframes celestial-illust-ping {
          0% { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(2.1); opacity: 0; }
        }

        @keyframes celestial-illust-dash {
          to { stroke-dashoffset: -20; }
        }

        .celestial-illust-anim-float { animation: celestial-illust-float 6s ease-in-out infinite; }
        .celestial-illust-anim-scan { animation: celestial-illust-scan 3s ease-in-out infinite; }
        .celestial-illust-anim-scan-y { animation: celestial-illust-scan-y 3.2s ease-in-out infinite; }
        .celestial-illust-anim-spin { animation: celestial-illust-spin 18s linear infinite; }
        .celestial-illust-anim-pulse { animation: celestial-illust-pulse 2.4s ease-in-out infinite; }
        .celestial-illust-anim-bounce { animation: celestial-illust-bounce 2.8s ease-in-out infinite; }
        .celestial-illust-anim-ping { animation: celestial-illust-ping 2.2s ease-out infinite; }
        .celestial-illust-anim-dash { animation: celestial-illust-dash 1.5s linear infinite; }

        .celestial-illust-root[data-animate="false"] .celestial-illust-anim-float,
        .celestial-illust-root[data-animate="false"] .celestial-illust-anim-scan,
        .celestial-illust-root[data-animate="false"] .celestial-illust-anim-scan-y,
        .celestial-illust-root[data-animate="false"] .celestial-illust-anim-spin,
        .celestial-illust-root[data-animate="false"] .celestial-illust-anim-pulse,
        .celestial-illust-root[data-animate="false"] .celestial-illust-anim-bounce,
        .celestial-illust-root[data-animate="false"] .celestial-illust-anim-ping,
        .celestial-illust-root[data-animate="false"] .celestial-illust-anim-dash {
          animation: none !important;
        }
      `}</style>

      {children}
    </div>
  );
}
