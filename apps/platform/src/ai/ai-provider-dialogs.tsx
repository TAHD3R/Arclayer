import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { SystemAiProviderOut } from "@arclayer/platform-openapi";

import {
  createAiProvider,
  PlatformAiServicesApiError,
  updateAiProvider,
} from "@/ai/ai-services-api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingDialog } from "@/components/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@/components/setting-dialog-field";

const COMPATIBILITY = [
  "openai",
  "anthropic",
  "deepseek",
  "openai_compatible",
  "anthropic_compatible",
] as const;

type Props = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: (messageKey: string) => void;
  provider?: SystemAiProviderOut;
}>;

function mutationError(error: unknown): { key: string; code: string } {
  if (!(error instanceof PlatformAiServicesApiError)) {
    return { key: "PROVIDER_CHANGE_ERROR", code: "PLATFORM_AI_PROVIDER_CHANGE_FAILED" };
  }
  if (error.status === 401 || error.status === 403) {
    return { key: "PROVIDER_CHANGE_PERMISSION_ERROR", code: error.message };
  }
  if (error.status === 409) return { key: "PROVIDER_CHANGE_CONFLICT_ERROR", code: error.message };
  if (error.status === 422) {
    return { key: "PROVIDER_CHANGE_VALIDATION_ERROR", code: error.message };
  }
  return { key: "PROVIDER_CHANGE_ERROR", code: error.message };
}

export function AiProviderEditorDialog(props: Props) {
  const { t } = useTranslation("ai");
  const [compatibility, setCompatibility] = useState<(typeof COMPATIBILITY)[number]>(
    props.provider?.compatibility ?? "openai_compatible",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ key: string; code: string } | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const label = String(form.get("label") ?? "").trim();
    if (!label) return;

    setPending(true);
    setError(null);
    try {
      if (props.provider) {
        await updateAiProvider(props.provider.id, { label });
      } else {
        const model = String(form.get("model") ?? "").trim();
        const apiKey = String(form.get("apiKey") ?? "").trim();
        const baseUrl = String(form.get("baseUrl") ?? "").trim() || null;
        const provider = String(form.get("provider") ?? "").trim();
        if (!model || !provider || !apiKey) return;
        await createAiProvider({
          baseUrl,
          compatibility,
          label,
          provider,
          providerApiKey: apiKey,
          requestModel: model,
        });
      }
      props.onCompleted(props.provider ? "PROVIDER_UPDATED" : "PROVIDER_CREATED");
      props.onOpenChange(false);
    } catch (caught) {
      setError(mutationError(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      title={t(props.provider ? "EDIT_PROVIDER" : "ADD_PROVIDER")}
      description={t(props.provider ? "EDIT_PROVIDER_DESCRIPTION" : "ADD_PROVIDER_DESCRIPTION")}
      footer={
        <>
          <Button disabled={pending} variant="outline" onClick={() => props.onOpenChange(false)}>
            {t("CANCEL")}
          </Button>
          <Button disabled={pending} form="ai-provider-editor" type="submit">
            {pending ? t("WORKING") : t("SAVE_PROVIDER")}
          </Button>
        </>
      }
    >
      <form id="ai-provider-editor" onSubmit={submit}>
        <SettingDialogFields>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>{t("PROVIDER_CHANGE_FAILED")}</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{t(error.key)}</p>
                <code className="block text-xs">{error.code}</code>
              </AlertDescription>
            </Alert>
          ) : null}
          <SettingDialogField title={<label htmlFor="ai-provider-label">{t("LABEL")}</label>}>
            <Input
              id="ai-provider-label"
              name="label"
              defaultValue={props.provider?.label}
              required
            />
          </SettingDialogField>
          {!props.provider ? (
            <>
              <SettingDialogField title={<label htmlFor="ai-provider-key">{t("PROVIDER")}</label>}>
                <Input id="ai-provider-key" name="provider" required />
              </SettingDialogField>
              <SettingDialogField title={<label htmlFor="ai-provider-model">{t("MODEL")}</label>}>
                <Input id="ai-provider-model" name="model" required />
              </SettingDialogField>
              <SettingDialogField title={t("COMPATIBILITY_MODE")}>
                <Select
                  value={compatibility}
                  onValueChange={(value) =>
                    setCompatibility(value as (typeof COMPATIBILITY)[number])
                  }
                >
                  <SelectTrigger aria-label={t("COMPATIBILITY_MODE")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPATIBILITY.map((item) => (
                      <SelectItem key={item} value={item}>
                        {t(`COMPATIBILITY_${item.toUpperCase()}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingDialogField>
              <SettingDialogField
                title={<label htmlFor="ai-provider-base-url">{t("BASE_URL")}</label>}
              >
                <Input id="ai-provider-base-url" name="baseUrl" />
              </SettingDialogField>
              <SettingDialogField
                title={<label htmlFor="ai-provider-api-key">{t("API_KEY")}</label>}
                description={t("API_KEY_WRITE_ONLY_HELP")}
              >
                <Input
                  id="ai-provider-api-key"
                  name="apiKey"
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </SettingDialogField>
            </>
          ) : null}
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}
