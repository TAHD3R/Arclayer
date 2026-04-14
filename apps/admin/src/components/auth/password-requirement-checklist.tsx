import { CheckCircle2, Circle, CircleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { cn } from "@arclayer/lib/utils";
import { getPasswordRequirementStates } from "@/lib/auth/form-feedback";

type PasswordRequirementChecklistProps = {
  password: string;
  t: (key: string) => string;
  active?: boolean;
  className?: string;
};

export function PasswordRequirementChecklist(props: PasswordRequirementChecklistProps) {
  const requirements = getPasswordRequirementStates(props.password, props.t);
  const hasValue = props.password.length > 0;
  const allMet = requirements.every((requirement) => requirement.met);

  return (
    <AnimatePresence initial={false} mode="wait">
      {props.active ? (
        allMet ? (
          <motion.div
            key="password-requirements-met"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className={cn("pt-1", props.className)}
          >
            <div className="flex items-start gap-2 text-footnote text-success">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
              <span>{props.t("auth:PASSWORD_REQUIREMENTS_MET")}</span>
            </div>
          </motion.div>
        ) : (
          <motion.ul
            key="password-requirements-list"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className={cn("grid gap-1.5 pt-1 text-footnote", props.className)}
          >
            {requirements.map((requirement, index) => {
              const icon = requirement.met ? (
                <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
              ) : hasValue ? (
                <CircleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
              ) : (
                <Circle className="size-4 shrink-0 text-label-tertiary" aria-hidden="true" />
              );
              const textClassName = requirement.met
                ? "text-success"
                : hasValue
                  ? "text-destructive"
                  : "text-label-secondary";

              return (
                <motion.li
                  key={requirement.key}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.14, delay: index * 0.02, ease: "easeOut" }}
                  className={cn("flex items-start gap-2", textClassName)}
                >
                  {icon}
                  <span>{requirement.label}</span>
                </motion.li>
              );
            })}
          </motion.ul>
        )
      ) : null}
    </AnimatePresence>
  );
}
