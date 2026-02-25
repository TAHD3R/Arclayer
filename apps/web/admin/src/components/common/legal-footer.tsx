import { Button } from "antd";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type LegalModal = "terms" | "privacy" | null;

interface LegalFooterProps {
  i18nKey: string;
}

export function LegalFooter({ i18nKey }: LegalFooterProps) {
  const { t } = useTranslation();
  const [openModal, setOpenModal] = useState<LegalModal>(null);

  return (
    <>
      <p className="text-caption text-label-tertiary">
        <Trans
          i18nKey={i18nKey}
          components={{
            terms: (
              <Button
                type="link"
                size="small"
                className="!p-0 !h-auto !text-caption !text-label-tertiary underline"
                onClick={() => setOpenModal("terms")}
              />
            ),
            privacy: (
              <Button
                type="link"
                size="small"
                className="!p-0 !h-auto !text-caption !text-label-tertiary underline"
                onClick={() => setOpenModal("privacy")}
              />
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
            <Button type="primary" onClick={() => setOpenModal(null)}>
              {t("auth:MODAL_OK")}
            </Button>
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
            <Button type="primary" onClick={() => setOpenModal(null)}>
              {t("auth:MODAL_OK")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
