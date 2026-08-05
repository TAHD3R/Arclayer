import type { PropsWithChildren } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";

import type { WelcomeOnboardingStepId } from "../types";

export const onboardingMotionItemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.12 } },
};

export function OnboardingMotionItem(
  props: PropsWithChildren<{ className?: string; "data-testid"?: string }>,
) {
  return (
    <motion.div
      variants={onboardingMotionItemVariants}
      className={props.className}
      data-testid={props["data-testid"]}
    >
      {props.children}
    </motion.div>
  );
}

export function OnboardingStepTransition(
  props: PropsWithChildren<{
    step: WelcomeOnboardingStepId;
    direction: 1 | -1;
    reduceMotion: boolean;
  }>,
) {
  const initial = props.reduceMotion
    ? { opacity: 0 }
    : { opacity: 0, y: 10 * props.direction, filter: "blur(4px)" };
  const animate = props.reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" };
  const exit = props.reduceMotion
    ? { opacity: 0 }
    : { opacity: 0, y: -8 * props.direction, filter: "blur(3px)" };

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={props.step}
        initial={initial}
        animate={
          props.reduceMotion
            ? animate
            : {
                ...animate,
                transition: {
                  staggerChildren: 0.05,
                  delayChildren: 0.02,
                  duration: 0.22,
                  ease: "easeOut",
                },
              }
        }
        exit={exit}
        transition={{ duration: props.reduceMotion ? 0.12 : 0.22, ease: "easeOut" }}
        data-testid="onboarding-step-transition"
        className="min-h-0 flex-1 overflow-y-auto pl-1 pr-1"
      >
        {props.children}
      </motion.div>
    </AnimatePresence>
  );
}
