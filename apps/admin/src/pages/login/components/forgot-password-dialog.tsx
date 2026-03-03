import { Button, Form, Input } from "antd";
import { Mail } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { motion, type Variants } from "motion/react";

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
  const [form] = Form.useForm<{ identifier: string }>();

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen && !loading) {
      form.resetFields();
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-100"
        onInteractOutside={(e) => {
          if (loading) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (loading) e.preventDefault();
        }}
        showCloseButton={!loading}
      >
        <DialogHeader>
          <DialogTitle>{t("auth:FORGOT_PASSWORD_MODAL_TITLE")}</DialogTitle>
        </DialogHeader>

        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            show: {
              transition: { staggerChildren: 0.05, delayChildren: 0.1 },
            },
          }}
          className="flex flex-col gap-y-3"
        >
          <motion.div variants={reducedMotion ? {} : itemVariants} className="space-y-3">
            <DialogDescription className="text-callout text-label-secondary">
              {t("auth:FORGOT_PASSWORD_MODAL_DESC")}
            </DialogDescription>
          </motion.div>

          <motion.div variants={reducedMotion ? {} : itemVariants}>
            <Form
              form={form}
              layout="vertical"
              requiredMark={false}
              autoComplete="off"
              onFinish={async (values) => {
                setLoading(true);
                try {
                  await onSubmit(values.identifier);
                  onOpenChange(false);
                  form.resetFields();
                } finally {
                  setLoading(false);
                }
              }}
            >
              <Form.Item
                name="identifier"
                rules={[
                  {
                    required: true,
                    message: t("auth:VALIDATION_ACCOUNT_REQUIRED"),
                  },
                ]}
                className="mb-0!"
              >
                <Input
                  size="large"
                  autoComplete="off"
                  aria-label={t("auth:FORGOT_PASSWORD_MODAL_FIELD_PLACEHOLDER")}
                  placeholder={t("auth:FORGOT_PASSWORD_MODAL_FIELD_PLACEHOLDER")}
                  prefix={<Mail size={16} />}
                  disabled={loading}
                />
              </Form.Item>
            </Form>

            <div className="mt-2 text-center">
              <Button
                type="link"
                className="px-0!"
                disabled={loading}
                onClick={() => {
                  onOpenChange(false);
                  void navigate({ to: "/reset-password" });
                }}
                autoInsertSpace={false}
              >
                {t("auth:FORGOT_PASSWORD_MODAL_HAVE_TOKEN")}
              </Button>
            </div>
          </motion.div>

          <motion.div variants={reducedMotion ? {} : itemVariants}>
            <DialogFooter>
              <Button
                type="text"
                disabled={loading}
                onClick={() => onOpenChange(false)}
                autoInsertSpace={false}
              >
                {t("auth:MODAL_CANCEL")}
              </Button>
              <Button
                type="primary"
                loading={loading}
                onClick={() => form.submit()}
                autoInsertSpace={false}
              >
                {t("auth:MODAL_SUBMIT")}
              </Button>
            </DialogFooter>
          </motion.div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
