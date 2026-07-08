import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { Input } from "@arclayer/ui/input";
import { Switch } from "@arclayer/ui/switch";
import { Textarea } from "@arclayer/ui/textarea";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { notifySuccessText } from "@/lib/notifications";
import {
  SystemSettingField,
  SystemSettingFooterActions,
  SystemSettingItem,
  SystemSettingRow,
  SystemSettingStack,
} from "@/pages/system/components/system-setting-item";
import {
  getSystemSettingsSection,
  readBooleanValue,
  readStringArrayValue,
  readStringValue,
  usePatchSystemCoreSettings,
  useSystemCoreSettings,
} from "@/pages/system/hooks/use-system-core-settings";
import {
  FieldMessage,
  joinLineList,
  splitLineList,
} from "@/pages/system/system-settings-form-utils";

const DEFAULT_BASE_DOMAIN = "arclayer.localhost";
const DEFAULT_ADMIN_SUBDOMAIN = "app";
const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const BUILTIN_RESERVED_LABELS = [
  "app",
  "admin",
  "api",
  "www",
  "auth",
  "login",
  "dashboard",
  "studio",
  "preview",
  "editor",
  "system",
  "static",
  "storage",
  "rustfs",
  "assets",
  "cdn",
  "media",
  "docs",
  "help",
  "support",
  "status",
  "billing",
  "security",
  "mail",
  "smtp",
  "imap",
  "pop",
  "mx",
  "ns",
  "ns1",
  "ns2",
  "ftp",
  "ssh",
  "git",
  "localhost",
  "test",
  "staging",
  "dev",
] as const;

type DomainsFormValues = {
  baseDomain: string;
  adminSubdomain: string;
  autoAssignProjectSubdomains: boolean;
  reservedLabels: string;
};

function normalizeBaseDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\*\./, "")
    .replace(/^\.+|\.+$/g, "");
}

function normalizeDomainLabel(value: string): string {
  return value.trim().toLowerCase().replace(/^\./, "");
}

function isValidDomainLabel(value: string): boolean {
  return DOMAIN_LABEL_PATTERN.test(normalizeDomainLabel(value));
}

function isValidBaseDomain(value: string): boolean {
  const normalized = normalizeBaseDomain(value);
  if (!normalized || normalized.length > 253) return false;
  const labels = normalized.split(".");
  return labels.length >= 2 && labels.every(isValidDomainLabel);
}

function mergeReservedLabels(values: readonly string[]): string[] {
  return Array.from(
    new Set([...BUILTIN_RESERVED_LABELS, ...values.map(normalizeDomainLabel)].filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right));
}

function buildInitialValues(
  input: ReturnType<typeof useSystemCoreSettings>["coreSettings"],
): DomainsFormValues {
  const domains = getSystemSettingsSection(input, "domains");
  const reservedLabels = mergeReservedLabels(readStringArrayValue(domains, "reserved_labels"));

  return {
    baseDomain: readStringValue(domains, "base_domain") ?? DEFAULT_BASE_DOMAIN,
    adminSubdomain: readStringValue(domains, "admin_subdomain") ?? DEFAULT_ADMIN_SUBDOMAIN,
    autoAssignProjectSubdomains:
      readBooleanValue(domains, "auto_assign_project_subdomains") ?? true,
    reservedLabels: joinLineList(reservedLabels),
  };
}

function DomainSummaryRow(props: { label: string; value: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1 border-t border-border/70 py-3 first:border-t-0 sm:grid-cols-[minmax(8rem,0.35fr)_minmax(0,1fr)] sm:gap-4">
      <div className="text-headline text-label-primary">{props.label}</div>
      <div className="grid min-w-0 gap-2 text-footnote text-label-primary">{props.value}</div>
    </div>
  );
}

function platformUrl(hostname: string): string {
  return `https://${hostname}`;
}

function DomainSummaryValue(props: { children: ReactNode; muted?: boolean }) {
  return (
    <span
      className={
        props.muted
          ? "min-w-0 break-all font-mono text-label-secondary"
          : "min-w-0 break-all font-mono text-label-primary"
      }
    >
      {props.children}
    </span>
  );
}

function DomainPreviewSummary(props: {
  baseDomain: string;
  adminSubdomain: string;
  autoAssign: boolean;
}) {
  const { t } = useTranslation(["settings"]);
  const baseDomain = normalizeBaseDomain(props.baseDomain) || DEFAULT_BASE_DOMAIN;
  const adminSubdomain = normalizeDomainLabel(props.adminSubdomain) || DEFAULT_ADMIN_SUBDOMAIN;

  return (
    <div className="min-w-0">
      <DomainSummaryRow
        label={t("settings:SETTINGS_SYSTEM_DOMAINS_PREVIEW_BASE")}
        value={<DomainSummaryValue>{platformUrl(baseDomain)}</DomainSummaryValue>}
      />
      <DomainSummaryRow
        label={t("settings:SETTINGS_SYSTEM_DOMAINS_PREVIEW_ADMIN")}
        value={
          <DomainSummaryValue>{platformUrl(`${adminSubdomain}.${baseDomain}`)}</DomainSummaryValue>
        }
      />
      <DomainSummaryRow
        label={t("settings:SETTINGS_SYSTEM_DOMAINS_PREVIEW_PROJECT")}
        value={
          <DomainSummaryValue muted={!props.autoAssign}>
            {props.autoAssign
              ? platformUrl(`saas-landing-page.${baseDomain}`)
              : t("settings:SETTINGS_DISABLED")}
          </DomainSummaryValue>
        }
      />
    </div>
  );
}

export function SystemSettingsDomainsPage() {
  const { t } = useTranslation(["settings"]);
  const { savingKey, withSavingKey } = useSavingKey();
  const coreSettingsQuery = useSystemCoreSettings();
  const patchMutation = usePatchSystemCoreSettings();
  const [baseDomainError, setBaseDomainError] = useState<string | null>(null);
  const [adminSubdomainError, setAdminSubdomainError] = useState<string | null>(null);
  const [reservedLabelsError, setReservedLabelsError] = useState<string | null>(null);

  const initialValues = useMemo(
    () => buildInitialValues(coreSettingsQuery.coreSettings),
    [coreSettingsQuery.coreSettings],
  );

  const form = useForm<DomainsFormValues>({
    defaultValues: initialValues,
    mode: "onSubmit",
  });
  const values = form.watch();
  const platformDirty =
    values.baseDomain !== initialValues.baseDomain ||
    values.adminSubdomain !== initialValues.adminSubdomain ||
    values.autoAssignProjectSubdomains !== initialValues.autoAssignProjectSubdomains;
  const reservedDirty = values.reservedLabels !== initialValues.reservedLabels;

  useEffect(() => {
    if (!coreSettingsQuery.coreSettings) return;
    if (form.formState.isDirty) return;
    form.reset(initialValues);
  }, [coreSettingsQuery.coreSettings, form, initialValues]);

  const persistPatch = async (patch: Record<string, unknown>, nextValues: DomainsFormValues) => {
    await patchMutation.mutateAsync(patch);
    form.reset(nextValues);
    notifySuccessText(t("settings:SETTINGS_SAVED"));
  };

  const savePlatformPolicy = () =>
    withSavingKey("domains.platform", async () => {
      const nextBaseDomain = normalizeBaseDomain(form.getValues("baseDomain"));
      const nextAdminSubdomain = normalizeDomainLabel(form.getValues("adminSubdomain"));
      const nextAutoAssign = Boolean(form.getValues("autoAssignProjectSubdomains"));

      setBaseDomainError(null);
      setAdminSubdomainError(null);
      if (!isValidBaseDomain(nextBaseDomain)) {
        setBaseDomainError(t("settings:SETTINGS_SYSTEM_DOMAINS_BASE_DOMAIN_INVALID"));
        return;
      }
      if (!isValidDomainLabel(nextAdminSubdomain)) {
        setAdminSubdomainError(t("settings:SETTINGS_SYSTEM_DOMAINS_LABEL_INVALID"));
        return;
      }

      const nextValues = {
        ...form.getValues(),
        baseDomain: nextBaseDomain,
        adminSubdomain: nextAdminSubdomain,
        autoAssignProjectSubdomains: nextAutoAssign,
      };
      await persistPatch(
        {
          domains: {
            base_domain: nextBaseDomain,
            admin_subdomain: nextAdminSubdomain,
            auto_assign_project_subdomains: nextAutoAssign,
          },
        },
        nextValues,
      );
    });

  const saveReservedLabels = () =>
    withSavingKey("domains.reservedLabels", async () => {
      setReservedLabelsError(null);
      const labels = mergeReservedLabels(splitLineList(form.getValues("reservedLabels")));
      const invalid = labels.find((label) => !isValidDomainLabel(label));
      if (invalid) {
        setReservedLabelsError(
          t("settings:SETTINGS_SYSTEM_DOMAINS_RESERVED_INVALID", { label: invalid }),
        );
        return;
      }
      const nextValues = {
        ...form.getValues(),
        reservedLabels: joinLineList(labels),
      };
      await persistPatch({ domains: { reserved_labels: labels } }, nextValues);
    });

  return (
    <ContentGuard
      loading={coreSettingsQuery.isLoading && !coreSettingsQuery.coreSettings}
      error={coreSettingsQuery.error}
      onRetry={() => void coreSettingsQuery.refetch()}
    >
      <SystemSettingStack>
        <SystemSettingItem
          id="platform-domains"
          title={t("settings:SETTINGS_SYSTEM_DOMAINS_PLATFORM_TITLE")}
          description={t("settings:SETTINGS_SYSTEM_DOMAINS_PLATFORM_DESC")}
          footer={
            <SystemSettingFooterActions
              dirty={platformDirty}
              pending={savingKey === "domains.platform" || patchMutation.isPending}
              onReset={() => {
                setBaseDomainError(null);
                setAdminSubdomainError(null);
                form.reset({
                  ...form.getValues(),
                  baseDomain: initialValues.baseDomain,
                  adminSubdomain: initialValues.adminSubdomain,
                  autoAssignProjectSubdomains: initialValues.autoAssignProjectSubdomains,
                });
              }}
              onSave={() => void savePlatformPolicy()}
            />
          }
        >
          <div className="grid gap-5">
            <DomainPreviewSummary
              baseDomain={values.baseDomain}
              adminSubdomain={values.adminSubdomain}
              autoAssign={values.autoAssignProjectSubdomains}
            />
            <div className="grid gap-4">
              <Controller
                control={form.control}
                name="baseDomain"
                render={({ field }) => (
                  <SystemSettingField
                    label={t("settings:SETTINGS_SYSTEM_DOMAINS_BASE_DOMAIN_LABEL")}
                    description={t("settings:SETTINGS_SYSTEM_DOMAINS_BASE_DOMAIN_DESC")}
                    message={<FieldMessage message={baseDomainError} />}
                  >
                    <Input {...field} placeholder="arclayer.io" autoComplete="off" />
                  </SystemSettingField>
                )}
              />
              <Controller
                control={form.control}
                name="adminSubdomain"
                render={({ field }) => (
                  <SystemSettingField
                    label={t("settings:SETTINGS_SYSTEM_DOMAINS_ADMIN_SUBDOMAIN_LABEL")}
                    description={t("settings:SETTINGS_SYSTEM_DOMAINS_ADMIN_SUBDOMAIN_DESC")}
                    message={<FieldMessage message={adminSubdomainError} />}
                  >
                    <Input {...field} placeholder="app" autoComplete="off" />
                  </SystemSettingField>
                )}
              />
            </div>
            <Controller
              control={form.control}
              name="autoAssignProjectSubdomains"
              render={({ field }) => (
                <SystemSettingRow
                  title={t("settings:SETTINGS_SYSTEM_DOMAINS_AUTO_ASSIGN_TITLE")}
                  description={t("settings:SETTINGS_SYSTEM_DOMAINS_AUTO_ASSIGN_DESC")}
                  control={
                    <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                  }
                />
              )}
            />
          </div>
        </SystemSettingItem>

        <SystemSettingItem
          id="reserved-labels"
          title={t("settings:SETTINGS_SYSTEM_DOMAINS_RESERVED_TITLE")}
          description={t("settings:SETTINGS_SYSTEM_DOMAINS_RESERVED_DESC")}
          footer={
            <SystemSettingFooterActions
              dirty={reservedDirty}
              pending={savingKey === "domains.reservedLabels" || patchMutation.isPending}
              onReset={() => {
                setReservedLabelsError(null);
                form.reset({
                  ...form.getValues(),
                  reservedLabels: initialValues.reservedLabels,
                });
              }}
              onSave={() => void saveReservedLabels()}
            />
          }
        >
          <Controller
            control={form.control}
            name="reservedLabels"
            render={({ field }) => (
              <SystemSettingField
                label={t("settings:SETTINGS_SYSTEM_DOMAINS_RESERVED_LABELS_LABEL")}
                description={t("settings:SETTINGS_SYSTEM_DOMAINS_RESERVED_LABELS_DESC")}
                message={<FieldMessage message={reservedLabelsError} />}
                labelControls={false}
              >
                <Textarea
                  {...field}
                  rows={12}
                  spellCheck={false}
                  className="font-mono text-callout"
                  placeholder={"app\napi\npreview"}
                />
              </SystemSettingField>
            )}
          />
        </SystemSettingItem>
      </SystemSettingStack>
    </ContentGuard>
  );
}
