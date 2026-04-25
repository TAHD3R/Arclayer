import { type ReactNode, useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@arclayer/ui/dialog";

type LegalModal = "terms" | "privacy" | null;

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
      className={
        props.className ??
        "inline-flex items-baseline gap-0 px-1 align-baseline font-semibold text-primary underline-offset-4 transition-[box-shadow,_color,_background-color,_border-color,_outline-color,_text-decoration-color,_fill,_stroke] hover:underline focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
      }
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

function LegalModalDialogs(props: {
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
        <DialogContent className="sm:max-w-120">
          <DialogHeader>
            <DialogTitle>{t("auth:TERMS_OF_SERVICE_MODAL_TITLE")}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[min(60vh,32rem)] space-y-3 overflow-y-auto pr-1 text-callout text-label-secondary">
            <p>{t("auth:TERMS_OF_SERVICE_MODAL_CONTENT")}</p>
          </div>
          <DialogFooter>
            <Button onClick={() => props.setOpenModal(null)}>{t("auth:MODAL_OK")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={props.openModal === "privacy"}
        onOpenChange={(open) => !open && props.setOpenModal(null)}
      >
        <DialogContent className="sm:max-w-120">
          <DialogHeader>
            <DialogTitle>{t("auth:PRIVACY_POLICY_MODAL_TITLE")}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[min(60vh,32rem)] space-y-3 overflow-y-auto pr-1 text-callout text-label-secondary">
            <p>{t("auth:PRIVACY_POLICY_MODAL_CONTENT")}</p>
          </div>
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

export function LegalFooterLinks(props: {
  termsLabel: ReactNode;
  privacyLabel: ReactNode;
  className?: string;
  buttonClassName?: string;
}) {
  const [openModal, setOpenModal] = useState<LegalModal>(null);

  return (
    <>
      <div className={props.className}>
        <LegalFooterButton
          className={props.buttonClassName}
          onClick={() => setOpenModal("privacy")}
        >
          {props.privacyLabel}
        </LegalFooterButton>
        <LegalFooterButton className={props.buttonClassName} onClick={() => setOpenModal("terms")}>
          {props.termsLabel}
        </LegalFooterButton>
      </div>
      <LegalModalDialogs openModal={openModal} setOpenModal={setOpenModal} />
    </>
  );
}

export function LegalFooter({ i18nKey, className }: LegalFooterProps) {
  const [openModal, setOpenModal] = useState<LegalModal>(null);

  return (
    <>
      <p
        className={
          className ? `${className} text-label-secondary` : "text-footnote text-label-secondary"
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
