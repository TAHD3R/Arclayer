import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
  AgentVersionCreateRequest,
  SystemAgentDefinitionSummaryOut,
} from "@arclayer/platform-openapi";

import {
  createAiAssistant,
  createAiAssistantVersion,
  updateAiAssistant,
} from "@/ai/ai-assistants-api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";

type AssistantEditorProps = Readonly<{
  approvalProfiles: readonly string[];
  assistant?: SystemAgentDefinitionSummaryOut;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: () => void;
  supportedToolGrants: readonly string[];
}>;

function ErrorNotice(props: Readonly<{ message: string }>) {
  const { t } = useTranslation("ai");
  return (
    <Alert variant="destructive">
      <AlertTitle>{t("ACTION_FAILED")}</AlertTitle>
      <AlertDescription>{props.message}</AlertDescription>
    </Alert>
  );
}

export function AiAssistantEditorDialog(props: AssistantEditorProps) {
  const { t } = useTranslation("ai");
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [instructions, setInstructions] = useState("");
  const [approvalProfile, setApprovalProfile] = useState(props.approvalProfiles[0] ?? "");
  const [planMode, setPlanMode] = useState(true);
  const [buildMode, setBuildMode] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(props.assistant?.displayName ?? "");
    setSlug(props.assistant?.slug ?? "");
    setRole(props.assistant?.role ?? "");
    setDescription(props.assistant?.description ?? "");
    setAvatarUrl(props.assistant?.avatarUrl ?? "");
    setInstructions("");
    setApprovalProfile(props.approvalProfiles[0] ?? "");
    setPlanMode(true);
    setBuildMode(true);
    setError(null);
  }, [props.approvalProfiles, props.assistant, props.open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const modes = [planMode ? "plan" : null, buildMode ? "build" : null].filter(
      (value): value is "plan" | "build" => value !== null,
    );
    if (!displayName.trim() || !role.trim() || (!props.assistant && !slug.trim())) {
      setError(t("ASSISTANT_REQUIRED_FIELDS"));
      return;
    }
    if (!props.assistant && (!instructions.trim() || modes.length === 0 || !approvalProfile)) {
      setError(t("ASSISTANT_VERSION_REQUIRED_FIELDS"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      if (props.assistant) {
        await updateAiAssistant(props.assistant.id, {
          avatarUrl: avatarUrl.trim() || null,
          description: description.trim(),
          displayName: displayName.trim(),
          role: role.trim(),
        });
      } else {
        await createAiAssistant({
          avatarUrl: avatarUrl.trim() || null,
          description: description.trim(),
          displayName: displayName.trim(),
          initialVersion: {
            approvalProfile: { profileId: approvalProfile.trim() },
            instructions: instructions.trim(),
            supportedExecutionModes: modes,
            toolGrants: [...props.supportedToolGrants],
          },
          role: role.trim(),
          slug: slug.trim(),
        });
      }
      props.onCompleted();
      props.onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("ACTION_FAILED"));
    } finally {
      setPending(false);
    }
  };

  const formId = props.assistant ? "edit-ai-assistant" : "create-ai-assistant";
  return (
    <SettingDialog
      description={
        props.assistant ? t("EDIT_ASSISTANT_DESCRIPTION") : t("CREATE_ASSISTANT_DESCRIPTION")
      }
      footer={
        <>
          <Button disabled={pending} onClick={() => props.onOpenChange(false)} variant="outline">
            {t("CANCEL")}
          </Button>
          <Button disabled={pending} form={formId} type="submit">
            {pending ? t("WORKING") : t("SAVE")}
          </Button>
        </>
      }
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      open={props.open}
      title={props.assistant ? t("EDIT_ASSISTANT") : t("CREATE_ASSISTANT")}
    >
      <form id={formId} onSubmit={submit}>
        <SettingDialogFields>
          {error ? <ErrorNotice message={error} /> : null}
          <SettingDialogField title={<label htmlFor={`${formId}-name`}>{t("NAME")}</label>}>
            <Input
              id={`${formId}-name`}
              onChange={(event) => setDisplayName(event.target.value)}
              value={displayName}
            />
          </SettingDialogField>
          {!props.assistant ? (
            <SettingDialogField
              description={t("ASSISTANT_SLUG_DESCRIPTION")}
              title={<label htmlFor={`${formId}-slug`}>{t("ASSISTANT_SLUG")}</label>}
            >
              <Input
                autoComplete="off"
                id={`${formId}-slug`}
                onChange={(event) => setSlug(event.target.value)}
                value={slug}
              />
            </SettingDialogField>
          ) : null}
          <SettingDialogField title={<label htmlFor={`${formId}-role`}>{t("ROLE")}</label>}>
            <Input
              id={`${formId}-role`}
              onChange={(event) => setRole(event.target.value)}
              value={role}
            />
          </SettingDialogField>
          <SettingDialogField
            title={<label htmlFor={`${formId}-description`}>{t("DESCRIPTION")}</label>}
          >
            <Textarea
              id={`${formId}-description`}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              value={description}
            />
          </SettingDialogField>
          <SettingDialogField
            description={t("ASSISTANT_AVATAR_DESCRIPTION")}
            title={<label htmlFor={`${formId}-avatar`}>{t("ASSISTANT_AVATAR")}</label>}
          >
            <Input
              id={`${formId}-avatar`}
              onChange={(event) => setAvatarUrl(event.target.value)}
              type="url"
              value={avatarUrl}
            />
          </SettingDialogField>
          {!props.assistant ? (
            <InitialVersionFields
              approvalProfile={approvalProfile}
              approvalProfiles={props.approvalProfiles}
              buildMode={buildMode}
              instructions={instructions}
              onApprovalProfileChange={setApprovalProfile}
              onBuildModeChange={setBuildMode}
              onInstructionsChange={setInstructions}
              onPlanModeChange={setPlanMode}
              planMode={planMode}
            />
          ) : null}
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

function InitialVersionFields(
  props: Readonly<{
    approvalProfile: string;
    approvalProfiles: readonly string[];
    buildMode: boolean;
    instructions: string;
    planMode: boolean;
    onApprovalProfileChange: (value: string) => void;
    onBuildModeChange: (value: boolean) => void;
    onInstructionsChange: (value: string) => void;
    onPlanModeChange: (value: boolean) => void;
  }>,
) {
  const { t } = useTranslation("ai");
  return (
    <>
      <SettingDialogField
        description={t("ASSISTANT_INSTRUCTIONS_DESCRIPTION")}
        title={<label htmlFor="assistant-instructions">{t("ASSISTANT_INSTRUCTIONS")}</label>}
      >
        <Textarea
          id="assistant-instructions"
          onChange={(event) => props.onInstructionsChange(event.target.value)}
          rows={8}
          value={props.instructions}
        />
      </SettingDialogField>
      <SettingDialogField
        description={t("APPROVAL_PROFILE_DESCRIPTION")}
        title={<label htmlFor="assistant-approval">{t("APPROVAL_PROFILE")}</label>}
      >
        <Select onValueChange={props.onApprovalProfileChange} value={props.approvalProfile}>
          <SelectTrigger id="assistant-approval">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {props.approvalProfiles.map((profile) => (
              <SelectItem key={profile} value={profile}>
                {profile === "human-input-v1" ? t("APPROVAL_PROFILE_HUMAN_REVIEW") : profile}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingDialogField>
      <SettingDialogField title={t("SUPPORTED_MODES")}>
        <div className="flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={props.planMode}
              onCheckedChange={(checked) => props.onPlanModeChange(checked === true)}
            />
            {t("MODE_PLAN")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={props.buildMode}
              onCheckedChange={(checked) => props.onBuildModeChange(checked === true)}
            />
            {t("MODE_BUILD")}
          </label>
        </div>
      </SettingDialogField>
    </>
  );
}

export function AiAssistantVersionDialog(
  props: Readonly<{
    approvalProfiles: readonly string[];
    assistant: SystemAgentDefinitionSummaryOut;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCompleted: () => void;
    supportedToolGrants: readonly string[];
  }>,
) {
  const { t } = useTranslation("ai");
  const latest = props.assistant.latestVersion;
  const [instructions, setInstructions] = useState(latest?.instructions ?? "");
  const [approvalProfile, setApprovalProfile] = useState(
    latest?.approvalProfile.profileId ?? props.approvalProfiles[0] ?? "",
  );
  const [planMode, setPlanMode] = useState(
    latest?.supportedExecutionModes.includes("plan") ?? true,
  );
  const [buildMode, setBuildMode] = useState(
    latest?.supportedExecutionModes.includes("build") ?? true,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const supportedExecutionModes: AgentVersionCreateRequest["supportedExecutionModes"] = [];
    if (planMode) supportedExecutionModes.push("plan");
    if (buildMode) supportedExecutionModes.push("build");
    if (!instructions.trim() || supportedExecutionModes.length === 0 || !approvalProfile) {
      setError(t("ASSISTANT_VERSION_REQUIRED_FIELDS"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      await createAiAssistantVersion(props.assistant.id, {
        approvalProfile: { profileId: approvalProfile.trim() },
        compatibility: latest?.compatibility,
        delegationDefinitionIds: latest?.delegationDefinitionIds,
        instructions: instructions.trim(),
        knowledgeBaseIds: latest?.knowledgeBaseIds,
        modelPolicy: latest?.modelPolicy,
        skillGrantWorkspaceId: latest?.skillGrantWorkspaceId,
        skillInstallationIds: latest?.skillInstallationIds,
        supportedExecutionModes,
        toolGrants: [...props.supportedToolGrants],
      });
      props.onCompleted();
      props.onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("ACTION_FAILED"));
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      description={t("CREATE_ASSISTANT_VERSION_DESCRIPTION", {
        name: props.assistant.displayName,
      })}
      footer={
        <>
          <Button disabled={pending} onClick={() => props.onOpenChange(false)} variant="outline">
            {t("CANCEL")}
          </Button>
          <Button disabled={pending} form="create-ai-assistant-version" type="submit">
            {pending ? t("WORKING") : t("CREATE_VERSION")}
          </Button>
        </>
      }
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      open={props.open}
      title={t("CREATE_VERSION")}
    >
      <form id="create-ai-assistant-version" onSubmit={submit}>
        <SettingDialogFields>
          {error ? <ErrorNotice message={error} /> : null}
          <InitialVersionFields
            approvalProfile={approvalProfile}
            approvalProfiles={props.approvalProfiles}
            buildMode={buildMode}
            instructions={instructions}
            onApprovalProfileChange={setApprovalProfile}
            onBuildModeChange={setBuildMode}
            onInstructionsChange={setInstructions}
            onPlanModeChange={setPlanMode}
            planMode={planMode}
          />
          <SettingDialogField description={t("TOOL_ACCESS_DESCRIPTION")} title={t("TOOL_ACCESS")}>
            <p className="text-sm text-muted-foreground">
              {props.supportedToolGrants.length
                ? props.supportedToolGrants.join(", ")
                : t("TOOL_ACCESS_NONE")}
            </p>
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}
