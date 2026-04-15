import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { AuthLinkButton } from "@arclayer/ui/auth-controls";
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

export function LegalFooter({ i18nKey }: LegalFooterProps) {
  const { t } = useTranslation();
  const [openModal, setOpenModal] = useState<LegalModal>(null);

  return (
    <>
      <p className="text-footnote  text-label-secondary">
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
          <div className="max-h-[min(60vh,32rem)] space-y-3 overflow-y-auto pr-1 text-callout text-label-secondary">
            <p>{t("auth:TERMS_OF_SERVICE_MODAL_CONTENT")}</p>
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
          <div className="max-h-[min(60vh,32rem)] space-y-3 overflow-y-auto pr-1 text-callout text-label-secondary">
            <p>{t("auth:PRIVACY_POLICY_MODAL_CONTENT")}</p>
          </div>
          <DialogFooter>
            <Button onClick={() => setOpenModal(null)}>{t("auth:MODAL_OK")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
