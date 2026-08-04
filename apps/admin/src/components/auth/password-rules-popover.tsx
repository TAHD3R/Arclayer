import { type FocusEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { PasswordRequirementState } from "@/lib/auth/form-feedback";
import { PasswordRequirementChecklist } from "./password-requirement-checklist";

type PasswordRulesPopoverProps = {
  password: string;
  children: ReactNode;
  requirements?: PasswordRequirementState[];
};

export function PasswordRulesPopover(props: PasswordRulesPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !anchorRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && anchorRef.current?.contains(activeElement)) {
        activeElement.blur();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={anchorRef}
      className="relative"
      onFocusCapture={() => setOpen(true)}
      onPointerDownCapture={() => setOpen(true)}
      onClickCapture={() => setOpen(true)}
      onBlurCapture={(event: FocusEvent<HTMLDivElement>) => {
        if (
          event.relatedTarget instanceof Node &&
          anchorRef.current?.contains(event.relatedTarget)
        ) {
          return;
        }
        setOpen(false);
      }}
    >
      {props.children}
      {open ? (
        <div
          role="dialog"
          aria-label={t("auth:PASSWORD_REQUIREMENTS_TITLE")}
          className="absolute top-[calc(100%+0.75rem)] left-0 z-[2400] w-full rounded-2xl border border-border/80 bg-popover p-4 text-popover-foreground shadow-lg sm:top-1/2 sm:left-[calc(100%+0.75rem)] sm:w-72 sm:-translate-y-1/2"
        >
          <div className="grid gap-3">
            <p className="text-footnote font-semibold text-label-primary">
              {t("auth:PASSWORD_REQUIREMENTS_TITLE")}
            </p>
            <PasswordRequirementChecklist
              password={props.password}
              requirements={props.requirements}
              active
              collapseWhenComplete={false}
              className="pt-0"
              t={t}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
