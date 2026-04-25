import type { PropsWithChildren } from "react";
import { AnimatePresence, motion } from "motion/react";

import type { WelcomeOnboardingStep } from "../types";

export function OnboardingStepTransition(
  props: PropsWithChildren<{
    step: WelcomeOnboardingStep;
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
        animate={animate}
        exit={exit}
        transition={{ duration: props.reduceMotion ? 0.12 : 0.22, ease: "easeOut" }}
        className="min-h-0 flex-1 overflow-y-auto pl-1 pr-1"
      >
        {props.children}
      </motion.div>
    </AnimatePresence>
  );
}
