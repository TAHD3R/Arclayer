import { Mail } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { motion, type Variants } from "motion/react";
import { z } from "zod";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { AuthFieldError, AuthInputControl, AuthLinkButton } from "@/components/ui/auth-controls";
import { Button } from "@celestial/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@celestial/ui/dialog";

type ForgotPasswordDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (identifier: string) => Promise<void>;
  reducedMotion: boolean;
  itemVariants: Variants;
};

type ForgotPasswordFormValues = {
  identifier: string;
};

export function ForgotPasswordDialog({
  open,
  onOpenChange,
  onSubmit,
  reducedMotion,
  itemVariants,
}: ForgotPasswordDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(
      z.object({
        identifier: z.string().min(1, t("auth:VALIDATION_ACCOUNT_REQUIRED")),
      }),
    ),
    defaultValues: { identifier: "" },
    mode: "onSubmit",
  });

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen && !loading) form.reset();
    onOpenChange(nextOpen);
  };

  const handleSubmit = form.handleSubmit(async (values) => {
    setLoading(true);
    try {
      await onSubmit(values.identifier);
      form.reset();
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-100"
        onInteractOutside={(event) => loading && event.preventDefault()}
        onEscapeKeyDown={(event) => loading && event.preventDefault()}
        showCloseButton={!loading}
      >
        <DialogHeader>
          <DialogTitle>{t("auth:FORGOT_PASSWORD_MODAL_TITLE")}</DialogTitle>
        </DialogHeader>

        <motion.div
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } } }}
          className="flex flex-col gap-y-3"
        >
          <motion.div variants={reducedMotion ? {} : itemVariants} className="space-y-3">
            <DialogDescription className="text-callout text-label-secondary">
              {t("auth:FORGOT_PASSWORD_MODAL_DESC")}
            </DialogDescription>
          </motion.div>

          <motion.form
            variants={reducedMotion ? {} : itemVariants}
            className="grid gap-2"
            onSubmit={handleSubmit}
          >
            <AuthInputControl
              autoComplete="off"
              aria-label={t("auth:FORGOT_PASSWORD_MODAL_FIELD_PLACEHOLDER")}
              aria-invalid={form.formState.errors.identifier ? true : undefined}
              placeholder={t("auth:FORGOT_PASSWORD_MODAL_FIELD_PLACEHOLDER")}
              startIcon={<Mail size={16} />}
              disabled={loading}
              {...form.register("identifier")}
            />
            <AuthFieldError
              message={
                form.formState.errors.identifier?.message
                  ? String(form.formState.errors.identifier.message)
                  : undefined
              }
            />
          </motion.form>

          <motion.div variants={reducedMotion ? {} : itemVariants} className="text-center">
            <AuthLinkButton
              disabled={loading}
              onClick={() => {
                onOpenChange(false);
                void navigate({ to: "/reset-password" });
              }}
              type="button"
            >
              {t("auth:FORGOT_PASSWORD_MODAL_HAVE_TOKEN")}
            </AuthLinkButton>
          </motion.div>

          <motion.div variants={reducedMotion ? {} : itemVariants}>
            <DialogFooter>
              <Button variant="ghost" disabled={loading} onClick={() => onOpenChange(false)}>
                {t("auth:MODAL_CANCEL")}
              </Button>
              <Button loading={loading} onClick={() => void handleSubmit()}>
                {t("auth:MODAL_SUBMIT")}
              </Button>
            </DialogFooter>
          </motion.div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
