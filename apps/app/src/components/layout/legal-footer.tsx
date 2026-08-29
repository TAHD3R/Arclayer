import { type ReactNode, useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@arclayer/ui/dialog";

export type LegalModal = "terms" | "privacy" | null;

interface LegalFooterProps {
  i18nKey: string;
  className?: string;
}

function LegalFooterButton(props: {
  children?: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-baseline gap-0 align-baseline font-semibold text-label-secondary underline-offset-4 transition-[box-shadow,_color,_background-color,_border-color,_outline-color,_text-decoration-color,_fill,_stroke] hover:text-label-primary hover:underline focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
        props.className,
      )}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

export function LegalModalDialogs(props: {
  openModal: LegalModal;
  setOpenModal: (modal: LegalModal) => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      <Dialog
        open={props.openModal === "terms"}
        onOpenChange={(open) => !open && props.setOpenModal(null)}
      >
        <DialogContent className="sm:max-w-120" overlayClassName="backdrop-blur-xs">
          <DialogHeader>
            <DialogTitle>{t("auth:TERMS_OF_SERVICE_MODAL_TITLE")}</DialogTitle>
          </DialogHeader>
          <DialogDescription className="max-h-[min(60vh,32rem)] overflow-y-auto pr-1 text-callout text-label-secondary">
            {t("auth:TERMS_OF_SERVICE_MODAL_CONTENT")}
          </DialogDescription>
          <DialogFooter>
            <Button onClick={() => props.setOpenModal(null)}>{t("auth:MODAL_OK")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={props.openModal === "privacy"}
        onOpenChange={(open) => !open && props.setOpenModal(null)}
      >
        <DialogContent className="sm:max-w-120" overlayClassName="backdrop-blur-xs">
          <DialogHeader>
            <DialogTitle>{t("auth:PRIVACY_POLICY_MODAL_TITLE")}</DialogTitle>
          </DialogHeader>
          <DialogDescription className="max-h-[min(60vh,32rem)] overflow-y-auto pr-1 text-callout text-label-secondary">
            {t("auth:PRIVACY_POLICY_MODAL_CONTENT")}
          </DialogDescription>
          <DialogFooter>
            <Button onClick={() => props.setOpenModal(null)}>{t("auth:MODAL_OK")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function LegalFooterCopyright() {
  return (
    <div className="text-caption text-label-secondary">
      <Trans
        i18nKey="auth:FOOTER_COPYRIGHT"
        components={{
          brand: <span className="text-label-primary">Arclayer</span>,
        }}
      />
    </div>
  );
}

export function LegalFooter({ i18nKey, className }: LegalFooterProps) {
  const [openModal, setOpenModal] = useState<LegalModal>(null);

  return (
    <>
      <p
        className={
          className
            ? `${className} text-balance text-label-secondary`
            : "text-footnote text-balance text-label-secondary"
        }
      >
        <Trans
          i18nKey={i18nKey}
          components={{
            terms: <LegalFooterButton onClick={() => setOpenModal("terms")} />,
            privacy: <LegalFooterButton onClick={() => setOpenModal("privacy")} />,
          }}
        />
      </p>

      <LegalModalDialogs openModal={openModal} setOpenModal={setOpenModal} />
    </>
  );
}
