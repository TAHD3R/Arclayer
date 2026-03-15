import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { AuthLinkButton } from "@/components/ui/auth-controls";
import { Button } from "@celestial/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@celestial/ui/dialog";

type LegalModal = "terms" | "privacy" | null;

interface LegalFooterProps {
  i18nKey: string;
}

export function LegalFooter({ i18nKey }: LegalFooterProps) {
  const { t } = useTranslation();
  const [openModal, setOpenModal] = useState<LegalModal>(null);

  return (
    <>
      <p className="text-footnote leading-6 text-label-secondary">
        <Trans
          i18nKey={i18nKey}
          components={{
            terms: (
              <AuthLinkButton className="align-baseline" onClick={() => setOpenModal("terms")} />
            ),
            privacy: (
              <AuthLinkButton className="align-baseline" onClick={() => setOpenModal("privacy")} />
            ),
          }}
        />
      </p>

      <Dialog open={openModal === "terms"} onOpenChange={(open) => !open && setOpenModal(null)}>
        <DialogContent className="sm:max-w-120">
          <DialogHeader>
            <DialogTitle>{t("auth:TERMS_OF_SERVICE_MODAL_TITLE")}</DialogTitle>
          </DialogHeader>
          <div className="text-callout text-label-secondary space-y-3">
            <p>{t("auth:TERMS_OF_SERVICE_MODAL_CONTENT")}</p>
            <p className="text-label-tertiary">{t("auth:MODAL_PLACEHOLDER_HINT")}</p>
          </div>
          <DialogFooter>
            <Button onClick={() => setOpenModal(null)}>{t("auth:MODAL_OK")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openModal === "privacy"} onOpenChange={(open) => !open && setOpenModal(null)}>
        <DialogContent className="sm:max-w-120">
          <DialogHeader>
            <DialogTitle>{t("auth:PRIVACY_POLICY_MODAL_TITLE")}</DialogTitle>
          </DialogHeader>
          <div className="text-callout text-label-secondary space-y-3">
            <p>{t("auth:PRIVACY_POLICY_MODAL_CONTENT")}</p>
            <p className="text-label-tertiary">{t("auth:MODAL_PLACEHOLDER_HINT")}</p>
          </div>
          <DialogFooter>
            <Button onClick={() => setOpenModal(null)}>{t("auth:MODAL_OK")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
