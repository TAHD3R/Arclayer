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

type ForgotPasswordDialogStep = "form" | "success";

function ForgotPasswordSuccessView(props: {
  onClose: () => void;
  reducedMotion: boolean;
  itemVariants: Variants;
}) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.05, delayChildren: 0.08 } } }}
      className="grid gap-4"
    >
      <motion.div variants={props.reducedMotion ? {} : props.itemVariants}>
        <DialogDescription className="text-center text-callout text-label-secondary">
          {t("auth:FORGOT_PASSWORD_SUCCESS_DESC")}
        </DialogDescription>
      </motion.div>
      <motion.div variants={props.reducedMotion ? {} : props.itemVariants}>
        <DialogFooter>
          <Button onClick={props.onClose}>{t("auth:MODAL_OK")}</Button>
        </DialogFooter>
      </motion.div>
    </motion.div>
  );
}

function ForgotPasswordFormView(props: {
  form: ReturnType<typeof useForm<ForgotPasswordFormValues>>;
  loading: boolean;
  reducedMotion: boolean;
  itemVariants: Variants;
  onGoToReset: () => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } } }}
      className="flex flex-col gap-y-3"
    >
      <motion.div variants={props.reducedMotion ? {} : props.itemVariants} className="space-y-3">
        <DialogDescription className="text-callout text-label-secondary">
          {t("auth:FORGOT_PASSWORD_MODAL_DESC")}
        </DialogDescription>
      </motion.div>

      <motion.form
        variants={props.reducedMotion ? {} : props.itemVariants}
        className="grid gap-2"
        onSubmit={props.onSubmit}
      >
        <AuthInputControl
          autoComplete="off"
          aria-label={t("auth:FORGOT_PASSWORD_MODAL_FIELD_PLACEHOLDER")}
          aria-invalid={props.form.formState.errors.identifier ? true : undefined}
          placeholder={t("auth:FORGOT_PASSWORD_MODAL_FIELD_PLACEHOLDER")}
          startIcon={<Mail size={16} />}
          disabled={props.loading}
          {...props.form.register("identifier")}
        />
        <AuthFieldError
          message={
            props.form.formState.errors.identifier?.message
              ? String(props.form.formState.errors.identifier.message)
              : undefined
          }
        />
      </motion.form>

      <motion.div variants={props.reducedMotion ? {} : props.itemVariants} className="text-center">
        <AuthLinkButton disabled={props.loading} onClick={props.onGoToReset} type="button">
          {t("auth:FORGOT_PASSWORD_MODAL_HAVE_TOKEN")}
        </AuthLinkButton>
      </motion.div>

      <motion.div variants={props.reducedMotion ? {} : props.itemVariants}>
        <DialogFooter>
          <Button variant="ghost" disabled={props.loading} onClick={props.onCancel}>
            {t("auth:MODAL_CANCEL")}
          </Button>
          <Button loading={props.loading} onClick={props.onSubmit}>
            {t("auth:MODAL_SUBMIT")}
          </Button>
        </DialogFooter>
      </motion.div>
    </motion.div>
  );
}

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
  const [step, setStep] = useState<ForgotPasswordDialogStep>("form");
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
    if (!nextOpen && !loading) {
      form.reset();
      setStep("form");
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = form.handleSubmit(async (values) => {
    setLoading(true);
    try {
      await onSubmit(values.identifier);
      form.reset();
      setStep("success");
    } finally {
      setLoading(false);
    }
  });

  const titleKey =
    step === "success" ? "auth:FORGOT_PASSWORD_SUCCESS_TITLE" : "auth:FORGOT_PASSWORD_MODAL_TITLE";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-100"
        onInteractOutside={(event) => loading && event.preventDefault()}
        onEscapeKeyDown={(event) => loading && event.preventDefault()}
        showCloseButton={!loading}
      >
        <DialogHeader>
          <DialogTitle>{t(titleKey)}</DialogTitle>
        </DialogHeader>
        {step === "success" ? (
          <ForgotPasswordSuccessView
            onClose={() => handleClose(false)}
            reducedMotion={reducedMotion}
            itemVariants={itemVariants}
          />
        ) : (
          <ForgotPasswordFormView
            form={form}
            loading={loading}
            reducedMotion={reducedMotion}
            itemVariants={itemVariants}
            onGoToReset={() => {
              onOpenChange(false);
              void navigate({ to: "/reset-password" });
            }}
            onCancel={() => onOpenChange(false)}
            onSubmit={() => void handleSubmit()}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
