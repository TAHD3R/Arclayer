import { useEffect } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  CommercePlan,
  CommercePlanTier,
  CommercePlanUpsert,
  CreditRefreshInterval,
} from "@/api/commerce";
import { Button } from "@arclayer/ui/button";
import { Card, CardContent } from "@arclayer/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@arclayer/ui/field";
import { Input } from "@arclayer/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@arclayer/ui/select";
import { Separator } from "@arclayer/ui/separator";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { Switch } from "@arclayer/ui/switch";
import { Textarea } from "@arclayer/ui/textarea";

type FeatureFormValue = {
  key: string;
  label: string;
  description: string;
  included: boolean;
  value: string;
};

type PlanFormValues = {
  code: string;
  tier: CommercePlanTier;
  name: string;
  description: string;
  creditGrantAmount: string;
  creditRefreshInterval: CreditRefreshInterval;
  creditValueMicros: string;
  priceMonthly: string;
  priceYearly: string;
  currency: string;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: string;
  features: FeatureFormValue[];
};

type PlanEditorDialogProps = {
  open: boolean;
  plan: CommercePlan | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (code: string, payload: CommercePlanUpsert) => Promise<void>;
};

const PLAN_CODE_PATTERN = /^[a-z][a-z0-9_-]{1,47}$/;
const MICRODOLLARS_PER_DOLLAR = 1_000_000n;

function microsToPriceInput(value: number): string {
  const whole = Math.trunc(value / 1_000_000);
  const fraction = String(value % 1_000_000)
    .padStart(6, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

function parsePriceMicros(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(value.trim());
  if (!match) return null;
  const micros =
    BigInt(match[1]) * MICRODOLLARS_PER_DOLLAR + BigInt((match[2] ?? "").padEnd(6, "0"));
  return micros <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(micros) : null;
}

function parseInteger(value: string, minimum: number): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : null;
}

function initialValues(plan: CommercePlan | null): PlanFormValues {
  return {
    code: plan?.code ?? "",
    tier: plan?.tier ?? "premium",
    name: plan?.name ?? "",
    description: plan?.description ?? "",
    creditGrantAmount: String(plan?.creditGrantAmount ?? 0),
    creditRefreshInterval: plan?.creditRefreshInterval ?? "monthly",
    creditValueMicros: String(plan?.creditValueMicros ?? 1_000),
    priceMonthly: microsToPriceInput(plan?.priceMonthlyMicros ?? 0),
    priceYearly: microsToPriceInput(plan?.priceYearlyMicros ?? 0),
    currency: plan?.currency ?? "USD",
    isActive: plan?.isActive ?? true,
    isDefault: plan?.isDefault ?? false,
    sortOrder: String(plan?.sortOrder ?? 100),
    features:
      plan?.features.map((feature) => ({
        key: feature.key,
        label: feature.label,
        description: feature.description ?? "",
        included: feature.included,
        value: feature.value === null ? "" : String(feature.value),
      })) ?? [],
  };
}

export function PlanEditorDialog(props: PlanEditorDialogProps) {
  const { t } = useTranslation(["commerce", "common"]);
  const form = useForm<PlanFormValues>({ defaultValues: initialValues(props.plan) });
  const features = useFieldArray({ control: form.control, name: "features" });

  useEffect(() => {
    if (props.open) form.reset(initialValues(props.plan));
  }, [form, props.open, props.plan]);

  const submit = form.handleSubmit(async (values) => {
    const creditGrantAmount = parseInteger(values.creditGrantAmount, 0);
    const creditValueMicros = parseInteger(values.creditValueMicros, 1);
    const priceMonthlyMicros = parsePriceMicros(values.priceMonthly);
    const priceYearlyMicros = parsePriceMicros(values.priceYearly);
    const sortOrder = parseInteger(values.sortOrder, 0);

    if (creditGrantAmount === null) {
      form.setError("creditGrantAmount", {
        message: t("commerce:SETTINGS_VALIDATION_NON_NEGATIVE"),
      });
    }
    if (creditValueMicros === null) {
      form.setError("creditValueMicros", {
        message: t("commerce:SETTINGS_VALIDATION_POSITIVE"),
      });
    }
    if (priceMonthlyMicros === null) {
      form.setError("priceMonthly", {
        message: t("commerce:SETTINGS_VALIDATION_NON_NEGATIVE"),
      });
    }
    if (priceYearlyMicros === null) {
      form.setError("priceYearly", {
        message: t("commerce:SETTINGS_VALIDATION_NON_NEGATIVE"),
      });
    }
    if (sortOrder === null) {
      form.setError("sortOrder", { message: t("commerce:SETTINGS_VALIDATION_NON_NEGATIVE") });
    }
    if (
      creditGrantAmount === null ||
      creditValueMicros === null ||
      priceMonthlyMicros === null ||
      priceYearlyMicros === null ||
      sortOrder === null
    ) {
      return;
    }

    await props.onSubmit(values.code.trim(), {
      tier: values.tier,
      name: values.name.trim(),
      description: values.description.trim(),
      creditGrantAmount,
      creditRefreshInterval: values.creditRefreshInterval,
      creditValueMicros,
      priceMonthlyMicros,
      priceYearlyMicros,
      currency: values.currency.trim().toUpperCase(),
      isActive: values.isActive,
      isDefault: values.isDefault,
      sortOrder,
      features: values.features.map((feature) => ({
        key: feature.key.trim(),
        label: feature.label.trim(),
        description: feature.description.trim() || null,
        included: feature.included,
        value: feature.value.trim() || null,
      })),
    });
  });

  return (
    <SettingDialog
      open={props.open}
      preventInitialFocus={false}
      closeButtonLabel={t("common:CLOSE")}
      onOpenChange={props.onOpenChange}
      title={props.plan ? t("commerce:SETTINGS_EDIT_PLAN") : t("commerce:SETTINGS_ADD_PLAN")}
      description={t("commerce:SETTINGS_EDITOR_DESCRIPTION")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
            {t("common:CANCEL")}
          </Button>
          <Button
            type="button"
            loading={props.pending}
            disabled={props.pending}
            onClick={() => void submit()}
          >
            {t("commerce:SETTINGS_SAVE")}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={Boolean(form.formState.errors.code)}>
            <FieldLabel htmlFor="commerce-plan-code">{t("commerce:SETTINGS_PLAN_CODE")}</FieldLabel>
            <Input
              id="commerce-plan-code"
              disabled={Boolean(props.plan)}
              aria-invalid={Boolean(form.formState.errors.code)}
              {...form.register("code", {
                required: t("commerce:SETTINGS_VALIDATION_CODE"),
                pattern: {
                  value: PLAN_CODE_PATTERN,
                  message: t("commerce:SETTINGS_VALIDATION_CODE"),
                },
              })}
            />
            <FieldDescription>{t("commerce:SETTINGS_PLAN_CODE_DESC")}</FieldDescription>
            <FieldError errors={[form.formState.errors.code]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="commerce-plan-tier">{t("commerce:SETTINGS_PLAN_TIER")}</FieldLabel>
            <Select
              value={form.watch("tier")}
              onValueChange={(value) => form.setValue("tier", value as CommercePlanTier)}
            >
              <SelectTrigger id="commerce-plan-tier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {(["free", "premium", "enterprise"] as const).map((tier) => (
                    <SelectItem key={tier} value={tier}>
                      {t(`commerce:TIER_${tier.toUpperCase()}`)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field data-invalid={Boolean(form.formState.errors.name)}>
          <FieldLabel htmlFor="commerce-plan-name">{t("commerce:SETTINGS_PLAN_NAME")}</FieldLabel>
          <Input
            id="commerce-plan-name"
            aria-invalid={Boolean(form.formState.errors.name)}
            {...form.register("name", { required: t("commerce:SETTINGS_VALIDATION_REQUIRED") })}
          />
          <FieldError errors={[form.formState.errors.name]} />
        </Field>

        <Field data-invalid={Boolean(form.formState.errors.description)}>
          <FieldLabel htmlFor="commerce-plan-description">
            {t("commerce:SETTINGS_PLAN_DESCRIPTION")}
          </FieldLabel>
          <Textarea
            id="commerce-plan-description"
            rows={3}
            aria-invalid={Boolean(form.formState.errors.description)}
            {...form.register("description", {
              required: t("commerce:SETTINGS_VALIDATION_REQUIRED"),
            })}
          />
          <FieldError errors={[form.formState.errors.description]} />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={Boolean(form.formState.errors.creditGrantAmount)}>
            <FieldLabel htmlFor="commerce-plan-grant">{t("commerce:SETTINGS_GRANT")}</FieldLabel>
            <Input
              id="commerce-plan-grant"
              inputMode="numeric"
              aria-invalid={Boolean(form.formState.errors.creditGrantAmount)}
              {...form.register("creditGrantAmount")}
            />
            <FieldError errors={[form.formState.errors.creditGrantAmount]} />
          </Field>

          <Field data-invalid={Boolean(form.formState.errors.creditValueMicros)}>
            <FieldLabel htmlFor="commerce-plan-credit-value">
              {t("commerce:SETTINGS_CREDIT_VALUE")}
            </FieldLabel>
            <Input
              id="commerce-plan-credit-value"
              inputMode="numeric"
              aria-invalid={Boolean(form.formState.errors.creditValueMicros)}
              {...form.register("creditValueMicros")}
            />
            <FieldDescription>{t("commerce:SETTINGS_CREDIT_VALUE_DESC")}</FieldDescription>
            <FieldError errors={[form.formState.errors.creditValueMicros]} />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <Field data-invalid={Boolean(form.formState.errors.priceMonthly)}>
            <FieldLabel htmlFor="commerce-plan-monthly-price">
              {t("commerce:SETTINGS_PRICE_MONTHLY")}
            </FieldLabel>
            <Input
              id="commerce-plan-monthly-price"
              inputMode="decimal"
              aria-invalid={Boolean(form.formState.errors.priceMonthly)}
              {...form.register("priceMonthly")}
            />
            <FieldError errors={[form.formState.errors.priceMonthly]} />
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.priceYearly)}>
            <FieldLabel htmlFor="commerce-plan-yearly-price">
              {t("commerce:SETTINGS_PRICE_YEARLY")}
            </FieldLabel>
            <Input
              id="commerce-plan-yearly-price"
              inputMode="decimal"
              aria-invalid={Boolean(form.formState.errors.priceYearly)}
              {...form.register("priceYearly")}
            />
            <FieldError errors={[form.formState.errors.priceYearly]} />
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.currency)}>
            <FieldLabel htmlFor="commerce-plan-currency">
              {t("commerce:SETTINGS_CURRENCY")}
            </FieldLabel>
            <Input
              id="commerce-plan-currency"
              maxLength={3}
              aria-invalid={Boolean(form.formState.errors.currency)}
              {...form.register("currency", {
                required: t("commerce:SETTINGS_VALIDATION_REQUIRED"),
                pattern: {
                  value: /^[A-Za-z]{3}$/,
                  message: t("commerce:SETTINGS_VALIDATION_CURRENCY"),
                },
              })}
            />
            <FieldError errors={[form.formState.errors.currency]} />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="commerce-plan-refresh">
              {t("commerce:SETTINGS_REFRESH")}
            </FieldLabel>
            <Select
              value={form.watch("creditRefreshInterval")}
              onValueChange={(value) =>
                form.setValue("creditRefreshInterval", value as CreditRefreshInterval)
              }
            >
              <SelectTrigger id="commerce-plan-refresh">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {(["daily", "monthly", "yearly", "none"] as const).map((interval) => (
                    <SelectItem key={interval} value={interval}>
                      {t(`commerce:REFRESH_${interval.toUpperCase()}`)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.sortOrder)}>
            <FieldLabel htmlFor="commerce-plan-sort-order">
              {t("commerce:SETTINGS_SORT_ORDER")}
            </FieldLabel>
            <Input
              id="commerce-plan-sort-order"
              inputMode="numeric"
              aria-invalid={Boolean(form.formState.errors.sortOrder)}
              {...form.register("sortOrder")}
            />
            <FieldError errors={[form.formState.errors.sortOrder]} />
          </Field>
        </div>

        <Field orientation="horizontal">
          <Switch
            id="commerce-plan-active"
            checked={form.watch("isActive")}
            onCheckedChange={(checked) => form.setValue("isActive", checked, { shouldDirty: true })}
          />
          <FieldLabel htmlFor="commerce-plan-active">
            {t("commerce:SETTINGS_PLAN_ACTIVE")}
          </FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <Switch
            id="commerce-plan-default"
            checked={form.watch("isDefault")}
            onCheckedChange={(checked) =>
              form.setValue("isDefault", checked, { shouldDirty: true })
            }
          />
          <FieldLabel htmlFor="commerce-plan-default">
            {t("commerce:SETTINGS_PLAN_DEFAULT")}
          </FieldLabel>
        </Field>

        <Separator />

        <Field>
          <div className="flex items-center justify-between gap-3">
            <FieldLabel>{t("commerce:SETTINGS_FEATURES")}</FieldLabel>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                features.append({
                  key: "",
                  label: "",
                  description: "",
                  included: true,
                  value: "",
                })
              }
            >
              <Plus data-icon="inline-start" />
              {t("commerce:SETTINGS_ADD_FEATURE")}
            </Button>
          </div>

          <div className="flex flex-col gap-4">
            {features.fields.length === 0 ? (
              <FieldDescription>{t("commerce:SETTINGS_FEATURES_EMPTY")}</FieldDescription>
            ) : null}
            {features.fields.map((feature, index) => (
              <Card key={feature.id}>
                <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
                  <Input
                    aria-label={t("commerce:SETTINGS_FEATURE_KEY")}
                    placeholder={t("commerce:SETTINGS_FEATURE_KEY")}
                    aria-invalid={Boolean(form.formState.errors.features?.[index]?.key)}
                    {...form.register(`features.${index}.key`, {
                      required: t("commerce:SETTINGS_VALIDATION_REQUIRED"),
                    })}
                  />
                  <div className="flex gap-2">
                    <Input
                      className="min-w-0 flex-1"
                      aria-label={t("commerce:SETTINGS_FEATURE_LABEL")}
                      placeholder={t("commerce:SETTINGS_FEATURE_LABEL")}
                      aria-invalid={Boolean(form.formState.errors.features?.[index]?.label)}
                      {...form.register(`features.${index}.label`, {
                        required: t("commerce:SETTINGS_VALIDATION_REQUIRED"),
                      })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("commerce:SETTINGS_REMOVE_FEATURE")}
                      onClick={() => features.remove(index)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <Input
                    className="sm:col-span-2"
                    aria-label={t("commerce:SETTINGS_FEATURE_DESCRIPTION")}
                    placeholder={t("commerce:SETTINGS_FEATURE_DESCRIPTION")}
                    {...form.register(`features.${index}.description`)}
                  />
                  <Input
                    aria-label={t("commerce:SETTINGS_FEATURE_VALUE")}
                    placeholder={t("commerce:SETTINGS_FEATURE_VALUE")}
                    {...form.register(`features.${index}.value`)}
                  />
                  <Field orientation="horizontal">
                    <Switch
                      id={`commerce-plan-feature-${index}-included`}
                      checked={form.watch(`features.${index}.included`)}
                      onCheckedChange={(checked) =>
                        form.setValue(`features.${index}.included`, checked, { shouldDirty: true })
                      }
                    />
                    <FieldLabel htmlFor={`commerce-plan-feature-${index}-included`}>
                      {t("commerce:SETTINGS_FEATURE_INCLUDED_LABEL")}
                    </FieldLabel>
                  </Field>
                </CardContent>
              </Card>
            ))}
          </div>
        </Field>
      </FieldGroup>
    </SettingDialog>
  );
}
