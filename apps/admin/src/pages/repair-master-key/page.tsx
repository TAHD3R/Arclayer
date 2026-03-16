import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";

import * as authApi from "@/api/auth";
import * as systemApi from "@/api/system";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { getErrorMessage, notifyErrorText, notifySuccessText } from "@/lib/notifications";
import { useAuthStore } from "@/stores/use-auth-store";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { PasswordInput } from "@arclayer/ui/password-input";

type RepairFormValues = {
  confirmText: string;
  password: string;
};

function getBooleanValue(raw: unknown, keys: readonly string[]): boolean {
  if (!raw || typeof raw !== "object") return false;
  const record = raw as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
  }
  return false;
}

export function RepairMasterKeyPage() {
  const { t } = useTranslation(["setup", "common", "auth"]);
  const navigate = useNavigate();

  const accessToken = useAuthStore((state) => state.accessToken);
  const sessionVersion = useAuthStore((state) => state.sessionVersion);

  const schema = useMemo<z.ZodType<RepairFormValues>>(
    () =>
      z.object({
        confirmText: z
          .string()
          .trim()
          .min(1, t("setup:MASTER_KEY_REPAIR_CONFIRM_REQUIRED"))
          .refine((value) => value === "REPAIR", {
            message: t("setup:MASTER_KEY_REPAIR_CONFIRM_MISMATCH"),
          }),
        password: z.string().min(1, t("auth:VALIDATION_PASSWORD_REQUIRED")),
      }),
    [t],
  );

  const form = useForm<RepairFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      confirmText: "",
      password: "",
    },
    mode: "onSubmit",
  });

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
      notifySuccessText(t("setup:MASTER_KEY_REPAIR_SUCCESS"));
      form.reset();
      await statusQuery.refetch();
    },
    onError: (err) => {
      notifyErrorText(getErrorMessage(err));
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

  const onSubmit = form.handleSubmit(async (values) => {
    await repairMutation.mutateAsync(values);
  });

  const alertTone = status?.masterKeyReady
    ? "default"
    : status?.repairRequired
      ? "destructive"
      : "default";

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8 sm:py-10">
      <div className="mb-6">
        <h1 className="mb-2 text-title2 font-semibold text-foreground">
          {t("setup:MASTER_KEY_REPAIR_TITLE")}
        </h1>
        <p className="text-label-secondary">{t("setup:MASTER_KEY_REPAIR_SUBTITLE")}</p>
      </div>

      {statusQuery.isError ? (
        <Alert variant="destructive">
          <AlertTitle>{t("setup:MASTER_KEY_REPAIR_STATUS_LOAD_FAILED")}</AlertTitle>
          <AlertDescription>{getErrorMessage(statusQuery.error)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-4 space-y-3">
        <Alert variant={alertTone === "destructive" ? "destructive" : "default"}>
          <AlertTitle>
            {status?.masterKeyReady
              ? t("setup:MASTER_KEY_REPAIR_STATUS_OK")
              : status?.repairRequired
                ? t("setup:MASTER_KEY_REPAIR_STATUS_REQUIRED")
                : t("setup:MASTER_KEY_REPAIR_STATUS_UNKNOWN")}
          </AlertTitle>
          <AlertDescription>
            {status?.masterKeyReady
              ? t("setup:MASTER_KEY_REPAIR_STATUS_OK_DESC")
              : status?.repairRequired
                ? t("setup:MASTER_KEY_REPAIR_STATUS_REQUIRED_DESC")
                : t("setup:MASTER_KEY_REPAIR_STATUS_UNKNOWN_DESC")}
          </AlertDescription>
        </Alert>

        {!accessToken ? (
          <Alert>
            <AlertTitle>{t("setup:MASTER_KEY_REPAIR_LOGIN_REQUIRED")}</AlertTitle>
            <AlertDescription className="mt-3">
              <Button onClick={onLogin}>{t("auth:LOGIN_BUTTON")}</Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {accessToken && meQuery.isSuccess && !isSuperAdmin ? (
          <Alert variant="destructive">
            <AlertTitle>{t("setup:MASTER_KEY_REPAIR_SUPER_ADMIN_REQUIRED")}</AlertTitle>
            <AlertDescription>
              {t("setup:MASTER_KEY_REPAIR_SUPER_ADMIN_REQUIRED_DESC")}
            </AlertDescription>
          </Alert>
        ) : null}

        {status?.repairRequired ? (
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="mb-3">
              <h2 className="mb-1 text-title4 font-semibold text-foreground">
                {t("setup:MASTER_KEY_REPAIR_FORM_TITLE")}
              </h2>
              <p className="text-footnote text-label-secondary">
                {t("setup:MASTER_KEY_REPAIR_FORM_DESC")}
              </p>
            </div>

            <form className="space-y-4" autoComplete="off" onSubmit={onSubmit}>
              <div className="grid gap-1.5">
                <label className="font-semibold text-foreground" htmlFor="confirmText">
                  {t("setup:MASTER_KEY_REPAIR_CONFIRM_LABEL")}
                </label>
                <Input
                  id="confirmText"
                  placeholder="REPAIR"
                  disabled={loading || repairMutation.isPending}
                  aria-invalid={form.formState.errors.confirmText ? true : undefined}
                  {...form.register("confirmText")}
                />
                {form.formState.errors.confirmText?.message ? (
                  <div className="text-footnote text-destructive">
                    {String(form.formState.errors.confirmText.message)}
                  </div>
                ) : null}
              </div>

              <div className="grid gap-1.5">
                <label className="font-semibold text-foreground" htmlFor="password">
                  {t("setup:MASTER_KEY_REPAIR_PASSWORD_LABEL")}
                </label>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  disabled={loading || repairMutation.isPending}
                  aria-invalid={form.formState.errors.password ? true : undefined}
                  {...form.register("password")}
                />
                {form.formState.errors.password?.message ? (
                  <div className="text-footnote text-destructive">
                    {String(form.formState.errors.password.message)}
                  </div>
                ) : null}
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => void statusQuery.refetch()}
                  disabled={loading || repairMutation.isPending}
                >
                  {t("common:RETRY")}
                </Button>
                <Button
                  type="submit"
                  loading={repairMutation.isPending}
                  disabled={!accessToken || !isSuperAdmin || loading}
                >
                  {t("setup:MASTER_KEY_REPAIR_ACTION")}
                </Button>
              </div>
            </form>
          </div>
        ) : null}

        {status?.masterKeyReady ? (
          <div className="flex items-center justify-end gap-2">
            <Button onClick={() => void navigate({ to: "/", replace: true })}>
              {t("common:GO_HOME")}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
