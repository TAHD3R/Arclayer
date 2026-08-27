import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  applyAiPolicy,
  getAiPolicy,
  listAiPolicyRevisions,
  listAiProviders,
  previewAiPolicy,
  publishAiPolicy,
  saveAiPolicyDraft,
} from "@/ai/ai-services-api";
import { getAiAssistantCapabilities } from "@/ai/ai-assistants-api";
import { AiPage, AiState } from "@/ai/ai-page-state";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AiPoliciesPage() {
  const { t } = useTranslation("ai");
  const load = useCallback(
    async () => ({
      capabilities: await getAiAssistantCapabilities(),
      policy: await getAiPolicy(),
      revisions: await listAiPolicyRevisions({ page: 1, size: 20 }),
      providers: await listAiProviders(),
    }),
    [],
  );
  const { state, retry } = useMonitoringQuery(load, []);
  const [pending, setPending] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [defaultModel, setDefaultModel] = useState("");
  const [maxTokens, setMaxTokens] = useState("0");
  const [maxCost, setMaxCost] = useState("0");
  const [maxConcurrentRuns, setMaxConcurrentRuns] = useState("0");
  const [egress, setEgress] = useState(false);
  const [toolAllowlist, setToolAllowlist] = useState<string[]>([]);
  const [approvalClasses, setApprovalClasses] = useState<string[]>([]);
  const [retryLimit, setRetryLimit] = useState("0");
  const [reason, setReason] = useState("");
  const data = state.status === "ready" ? state.data : undefined;
  const policy = data?.policy;
  const draft = policy?.draft;
  const published = policy?.published;
  const revisions = data?.revisions.items ?? [];
  const source = draft ?? published;

  useEffect(() => {
    if (!source) return;
    setModels([...(source.allowedModels ?? [])]);
    setDefaultModel(source.defaultModel ?? "");
    setMaxTokens(String(source.maxTokensPerRequest));
    setMaxCost(String(source.maxCostMicrosPerRequest));
    setMaxConcurrentRuns(String(source.maxConcurrentRuns));
    setEgress(source.externalDataEgressAllowed ?? false);
    setToolAllowlist([...(source.toolAllowlist ?? [])]);
    setApprovalClasses([...(source.approvalRequiredEffectClasses ?? [])]);
    setRetryLimit(String(source.retryLimit));
  }, [source?.id]);

  const modelOptions = data
    ? Array.from(
        new Map(
          (data.providers.providers ?? []).flatMap((provider) =>
            (provider.modelMappings ?? []).map(
              (mapping) =>
                [
                  mapping.publicModel,
                  {
                    id: mapping.publicModel,
                    label: mapping.publicModel,
                    description: `${provider.label} · ${mapping.providerModel}`,
                  },
                ] as const,
            ),
          ),
        ).values(),
      )
    : [];
  const toolOptions = data
    ? data.capabilities.supportedToolGrants.map((id) => ({
        id,
        label: id,
        description: t("POLICY_TOOL_OPTION_DESCRIPTION"),
      }))
    : [];
  const approvalOptions = ["read", "write", "external_egress", "destructive"].map((id) => ({
    id,
    label: t(`POLICY_EFFECT_${id.toUpperCase()}`),
    description: t(`POLICY_EFFECT_${id.toUpperCase()}_DESCRIPTION`),
  }));
  const saveDraft = async () => {
    setPending("save");
    try {
      await saveAiPolicyDraft({
        allowedModels: models,
        defaultModel: defaultModel.trim() || null,
        maxTokensPerRequest: Number(maxTokens),
        maxCostMicrosPerRequest: Number(maxCost),
        maxConcurrentRuns: Number(maxConcurrentRuns),
        externalDataEgressAllowed: egress,
        toolAllowlist,
        approvalRequiredEffectClasses: approvalClasses as (
          | "read"
          | "write"
          | "external_egress"
          | "destructive"
        )[],
        retryLimit: Number(retryLimit),
      });
      toast.success(t("POLICY_DRAFT_SAVED"));
      retry();
    } catch (error) {
      toast.error(t("ACTION_FAILED"), {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setPending(null);
    }
  };
  const publish = async () => {
    if (!draft) return;
    setPending("publish");
    try {
      const preview = await previewAiPolicy({ draftId: draft.id });
      if (!preview.isApplicable) throw new Error("AI_POLICY_UNSUPPORTED_CONTROL");
      await publishAiPolicy({
        draftId: draft.id,
        previewHash: preview.sourceHash,
        reason: reason.trim() || "Platform policy change",
      });
      toast.success(t("POLICY_PUBLISHED"));
      retry();
    } catch (error) {
      toast.error(t("ACTION_FAILED"), {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setPending(null);
    }
  };
  const apply = async () => {
    if (!published) return;
    setPending("apply");
    try {
      await applyAiPolicy({
        revisionId: published.id,
        idempotencyKey: crypto.randomUUID(),
        reason: reason.trim() || "Platform policy apply",
      });
      toast.success(t("POLICY_APPLIED"));
      retry();
    } catch (error) {
      toast.error(t("ACTION_FAILED"), {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setPending(null);
    }
  };
  return (
    <AiPage description={t("POLICIES_DESCRIPTION")} title={t("POLICIES_TITLE")}>
      <AiState empty={() => false} retry={retry} state={state}>
        {() => (
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>{t("POLICY_DRAFT_TITLE")}</CardTitle>
                <CardDescription>{t("POLICY_DRAFT_DESCRIPTION")}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label>{t("POLICY_ALLOWED_MODELS")}</Label>
                  <PolicyMultiSelect
                    label={t("POLICY_ALLOWED_MODELS")}
                    onChange={setModels}
                    options={modelOptions}
                    placeholder={t("POLICY_ALLOWED_MODELS_PLACEHOLDER")}
                    selected={models}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ai-policy-default-model">{t("POLICY_DEFAULT_MODEL")}</Label>
                  <Select onValueChange={setDefaultModel} value={defaultModel}>
                    <SelectTrigger id="ai-policy-default-model">
                      <SelectValue placeholder={t("POLICY_DEFAULT_MODEL_PLACEHOLDER")} />
                    </SelectTrigger>
                    <SelectContent>
                      {modelOptions
                        .filter((option) => models.includes(option.id))
                        .map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            <div>
                              <div>{option.label}</div>
                              <div className="text-xs text-muted-foreground">
                                {option.description}
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ai-policy-max-tokens">{t("POLICY_MAX_TOKENS")}</Label>
                  <Input
                    id="ai-policy-max-tokens"
                    min={0}
                    onChange={(event) => setMaxTokens(event.target.value)}
                    placeholder={t("POLICY_MAX_TOKENS_PLACEHOLDER")}
                    type="number"
                    value={maxTokens}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ai-policy-max-cost">{t("POLICY_MAX_COST")}</Label>
                  <Input
                    id="ai-policy-max-cost"
                    min={0}
                    onChange={(event) => setMaxCost(event.target.value)}
                    placeholder={t("POLICY_MAX_COST_PLACEHOLDER")}
                    type="number"
                    value={maxCost}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ai-policy-max-concurrent">{t("POLICY_MAX_CONCURRENT")}</Label>
                  <Input
                    id="ai-policy-max-concurrent"
                    min={0}
                    onChange={(event) => setMaxConcurrentRuns(event.target.value)}
                    placeholder={t("POLICY_MAX_CONCURRENT_PLACEHOLDER")}
                    type="number"
                    value={maxConcurrentRuns}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm md:col-span-2">
                  <Checkbox
                    checked={egress}
                    onCheckedChange={(checked) => setEgress(checked === true)}
                  />
                  {t("POLICY_EXTERNAL_EGRESS")}
                </label>
                <div className="space-y-2 md:col-span-2">
                  <Label>{t("POLICY_TOOL_ALLOWLIST")}</Label>
                  <PolicyMultiSelect
                    label={t("POLICY_TOOL_ALLOWLIST")}
                    onChange={setToolAllowlist}
                    options={toolOptions}
                    placeholder={t("POLICY_TOOL_ALLOWLIST_PLACEHOLDER")}
                    selected={toolAllowlist}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>{t("POLICY_APPROVAL_CLASSES")}</Label>
                  <PolicyMultiSelect
                    label={t("POLICY_APPROVAL_CLASSES")}
                    onChange={setApprovalClasses}
                    options={approvalOptions}
                    placeholder={t("POLICY_APPROVAL_CLASSES_PLACEHOLDER")}
                    selected={approvalClasses}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("POLICY_RETRY_LIMIT")}</Label>
                  <Select onValueChange={setRetryLimit} value={retryLimit}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("POLICY_RETRY_LIMIT_PLACEHOLDER")} />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 21 }, (_, value) => (
                        <SelectItem key={value} value={String(value)}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="ai-policy-reason">{t("POLICY_REASON")}</Label>
                  <Input
                    id="ai-policy-reason"
                    onChange={(event) => setReason(event.target.value)}
                    placeholder={t("POLICY_REASON_PLACEHOLDER")}
                    value={reason}
                  />
                </div>
                <div className="flex flex-wrap gap-2 md:col-span-2">
                  <Button disabled={pending !== null} onClick={() => void saveDraft()}>
                    {t("SAVE_DRAFT")}
                  </Button>
                  <Button
                    disabled={!draft || pending !== null}
                    onClick={() => void publish()}
                    variant="secondary"
                  >
                    {t("PUBLISH")}
                  </Button>
                  <Button
                    disabled={!published || pending !== null}
                    onClick={() => void apply()}
                    variant="outline"
                  >
                    {t("APPLY")}
                  </Button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("POLICY_CURRENT_TITLE")}</CardTitle>
                <CardDescription>{t("POLICY_CURRENT_DESCRIPTION")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>{t("POLICY_DRAFT_STATUS", { sequence: draft?.sequence ?? t("NONE") })}</p>
                <p>
                  {t("POLICY_PUBLISHED_STATUS", { sequence: published?.sequence ?? t("NONE") })}
                </p>
                <p>
                  {t("POLICY_APPLIED_STATUS", {
                    applied: published?.appliedAt ? t("YES") : t("NO"),
                  })}
                </p>
                <p>
                  {t("POLICY_MODEL_COUNT", {
                    count: draft?.allowedModels?.length ?? published?.allowedModels?.length ?? 0,
                  })}
                </p>
                <p>
                  {t("POLICY_TOOL_COUNT", {
                    count: draft?.toolAllowlist?.length ?? published?.toolAllowlist?.length ?? 0,
                  })}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("POLICY_HISTORY_TITLE")}</CardTitle>
                <CardDescription>{t("POLICY_HISTORY_DESCRIPTION")}</CardDescription>
              </CardHeader>
              <CardContent>
                {revisions.length ? (
                  <ol className="space-y-3">
                    {revisions.map((revision) => (
                      <li
                        className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                        key={revision.id}
                      >
                        <div>
                          <p className="font-medium">
                            {t("POLICY_REVISION_LABEL", { sequence: revision.sequence })}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t(`POLICY_STATUS_${revision.status.toUpperCase()}`)} ·{" "}
                            {revision.contentHash.slice(0, 12)}
                          </p>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {revision.appliedAt ? t("POLICY_APPLIED") : t("POLICY_NOT_APPLIED")}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("POLICY_HISTORY_EMPTY")}</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </AiState>
    </AiPage>
  );
}

type PolicyOption = Readonly<{ id: string; label: string; description: string }>;

function PolicyMultiSelect(
  props: Readonly<{
    label: string;
    options: readonly PolicyOption[];
    placeholder: string;
    selected: readonly string[];
    onChange: (value: string[]) => void;
  }>,
) {
  const available = props.options.filter((option) => !props.selected.includes(option.id));
  return (
    <div className="space-y-2">
      <Select
        key={props.selected.join("|")}
        onValueChange={(value) => props.onChange([...props.selected, value])}
      >
        <SelectTrigger aria-label={props.label}>
          <SelectValue placeholder={props.placeholder} />
        </SelectTrigger>
        <SelectContent>
          {available.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              <div>
                <div>{option.label}</div>
                <div className="text-xs text-muted-foreground">{option.description}</div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {props.selected.length ? (
        <div className="flex flex-wrap gap-2">
          {props.selected.map((value) => (
            <Button
              key={value}
              onClick={() => props.onChange(props.selected.filter((item) => item !== value))}
              size="sm"
              type="button"
              variant="outline"
            >
              {value}
              <Trash2 aria-hidden="true" />
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
