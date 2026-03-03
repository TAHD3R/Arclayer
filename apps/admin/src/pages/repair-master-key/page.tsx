import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, Button, Form, Input, Typography, message } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";

import * as authApi from "@/api/auth";
import * as systemApi from "@/api/system";
import { getErrorMessage } from "@/lib/notifications";
import { useAuthStore } from "@/stores/use-auth-store";

type RepairFormValues = {
  confirmText: string;
  password: string;
};

function getBooleanValue(raw: unknown, keys: readonly string[]): boolean {
  if (!raw || typeof raw !== "object") return false;
  const record = raw as Record<string, unknown>;
  for (const k of keys) {
    const v = record[k];
    if (typeof v === "boolean") return v;
  }
  return false;
}

export function RepairMasterKeyPage() {
  const { t } = useTranslation(["setup", "common", "auth"]);
  const navigate = useNavigate();

  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);

  const [form] = Form.useForm<RepairFormValues>();

  const statusQuery = useQuery({
    queryKey: ["system", "setup", "status"],
    queryFn: async () => systemApi.getSetupStatus(),
    meta: { silent: true },
  });

  const meQuery = useQuery({
    queryKey: ["auth", "me", sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: async () => authApi.me(),
    meta: { silent: true },
  });

  const isSuperAdmin = useMemo(
    () => getBooleanValue(meQuery.data, ["isSuperAdmin", "is_super_admin"]),
    [meQuery.data],
  );

  const repairMutation = useMutation({
    mutationFn: async (values: RepairFormValues) => {
      return systemApi.repairSetupMasterKey({
        confirmText: values.confirmText,
        password: values.password,
      });
    },
    onSuccess: async () => {
      message.success(t("setup:MASTER_KEY_REPAIR_SUCCESS"));
      form.resetFields();
      await statusQuery.refetch();
    },
    onError: (err) => {
      message.error(getErrorMessage(err));
    },
  });

  const status = statusQuery.data ?? null;
  const loading = statusQuery.isPending || statusQuery.isFetching;

  const onLogin = () => {
    void navigate({
      to: "/login",
      search: { redirect: "/repair/master-key" },
    });
  };

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8 sm:py-10">
      <div className="mb-6">
        <Typography.Title level={2} className="mb-2!">
          {t("setup:MASTER_KEY_REPAIR_TITLE")}
        </Typography.Title>
        <Typography.Paragraph className="mb-0! text-label-secondary">
          {t("setup:MASTER_KEY_REPAIR_SUBTITLE")}
        </Typography.Paragraph>
      </div>

      {statusQuery.isError ? (
        <Alert
          type="error"
          showIcon
          message={t("setup:MASTER_KEY_REPAIR_STATUS_LOAD_FAILED")}
          description={getErrorMessage(statusQuery.error)}
        />
      ) : null}

      <div className="mt-4 space-y-3">
        <Alert
          type={status?.masterKeyReady ? "success" : status?.repairRequired ? "warning" : "info"}
          showIcon
          message={
            status?.masterKeyReady
              ? t("setup:MASTER_KEY_REPAIR_STATUS_OK")
              : status?.repairRequired
                ? t("setup:MASTER_KEY_REPAIR_STATUS_REQUIRED")
                : t("setup:MASTER_KEY_REPAIR_STATUS_UNKNOWN")
          }
          description={
            status?.masterKeyReady
              ? t("setup:MASTER_KEY_REPAIR_STATUS_OK_DESC")
              : status?.repairRequired
                ? t("setup:MASTER_KEY_REPAIR_STATUS_REQUIRED_DESC")
                : t("setup:MASTER_KEY_REPAIR_STATUS_UNKNOWN_DESC")
          }
        />

        {!accessToken ? (
          <Alert
            type="info"
            showIcon
            message={t("setup:MASTER_KEY_REPAIR_LOGIN_REQUIRED")}
            action={
              <Button type="primary" onClick={onLogin} autoInsertSpace={false}>
                {t("auth:LOGIN_BUTTON")}
              </Button>
            }
          />
        ) : null}

        {accessToken && meQuery.isSuccess && !isSuperAdmin ? (
          <Alert
            type="error"
            showIcon
            message={t("setup:MASTER_KEY_REPAIR_SUPER_ADMIN_REQUIRED")}
            description={t("setup:MASTER_KEY_REPAIR_SUPER_ADMIN_REQUIRED_DESC")}
          />
        ) : null}

        {status?.repairRequired ? (
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="mb-3">
              <Typography.Title level={4} className="mb-1!">
                {t("setup:MASTER_KEY_REPAIR_FORM_TITLE")}
              </Typography.Title>
              <Typography.Paragraph className="mb-0! text-footnote text-label-secondary">
                {t("setup:MASTER_KEY_REPAIR_FORM_DESC")}
              </Typography.Paragraph>
            </div>

            <Form
              form={form}
              layout="vertical"
              requiredMark={false}
              autoComplete="off"
              onFinish={(values) => void repairMutation.mutateAsync(values)}
            >
              <Form.Item<RepairFormValues>
                name="confirmText"
                label={t("setup:MASTER_KEY_REPAIR_CONFIRM_LABEL")}
                rules={[
                  { required: true, message: t("setup:MASTER_KEY_REPAIR_CONFIRM_REQUIRED") },
                  {
                    validator: async (_, value) => {
                      const normalized = String(value ?? "").trim();
                      if (normalized === "REPAIR") return;
                      throw new Error(t("setup:MASTER_KEY_REPAIR_CONFIRM_MISMATCH"));
                    },
                  },
                ]}
              >
                <Input placeholder="REPAIR" disabled={loading || repairMutation.isPending} />
              </Form.Item>

              <Form.Item<RepairFormValues>
                name="password"
                label={t("setup:MASTER_KEY_REPAIR_PASSWORD_LABEL")}
                rules={[{ required: true, message: t("auth:VALIDATION_PASSWORD_REQUIRED") }]}
              >
                <Input.Password
                  autoComplete="current-password"
                  disabled={loading || repairMutation.isPending}
                />
              </Form.Item>

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="default"
                  onClick={() => void statusQuery.refetch()}
                  disabled={loading || repairMutation.isPending}
                  autoInsertSpace={false}
                >
                  {t("common:RETRY")}
                </Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={repairMutation.isPending}
                  disabled={!accessToken || !isSuperAdmin || loading}
                  autoInsertSpace={false}
                >
                  {t("setup:MASTER_KEY_REPAIR_ACTION")}
                </Button>
              </div>
            </Form>
          </div>
        ) : null}

        {status?.masterKeyReady ? (
          <div className="flex items-center justify-end gap-2">
            <Button
              type="primary"
              onClick={() => void navigate({ to: "/", replace: true })}
              autoInsertSpace={false}
            >
              {t("common:GO_HOME")}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
