import { useRef, useState, type FormEvent, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import type {
  PlatformCustomRolePreviewOut,
  PlatformPermissionCatalogItemOut,
  PlatformRoleCatalogItemOut,
  PlatformStepUpProofIssueRequest,
} from "@arclayer/platform-openapi";

import {
  applyPlatformCustomRoleRevision,
  copyPlatformCustomRole,
  createPlatformCustomRole,
  PlatformAccessApiError,
  previewPlatformCustomRoleRevision,
  retirePlatformCustomRole,
} from "@/access/access-api";
import { verifyPlatformAction } from "@/access/platform-step-up";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SettingDialog } from "@/components/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@/components/setting-dialog-field";
import { Textarea } from "@/components/ui/textarea";

type MutationAttempt = Readonly<{
  correlationId: string;
  fingerprint: string;
  idempotencyKey: string;
  stepUpProof?: string;
}>;

type RoleDialogProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: (messageKey: string) => void;
  permissions: readonly PlatformPermissionCatalogItemOut[];
}>;

function mutationAttempt(
  ref: RefObject<MutationAttempt | null>,
  fingerprint: string,
): MutationAttempt {
  if (!ref.current || ref.current.fingerprint !== fingerprint) {
    ref.current = {
      correlationId: crypto.randomUUID(),
      fingerprint,
      idempotencyKey: crypto.randomUUID(),
    };
  }
  return ref.current;
}

function errorKey(error: unknown): string {
  if (!(error instanceof PlatformAccessApiError)) return "ACTION_ERROR";
  if (error.message === "PLATFORM_WEBAUTHN_CANCELLED") return "SECURITY_KEY_CANCELLED";
  if (error.message === "PLATFORM_WEBAUTHN_UNAVAILABLE") return "SECURITY_KEY_UNAVAILABLE";
  if (error.status === 401 || error.status === 403) return "ACTION_PERMISSION_ERROR";
  if (error.status === 409) return "ACTION_CONFLICT_ERROR";
  if (error.status === 422) return "ACTION_VALIDATION_ERROR";
  return "ACTION_ERROR";
}

function MutationError({ messageKey }: Readonly<{ messageKey: string }>) {
  const { t } = useTranslation("access");
  return (
    <Alert variant="destructive">
      <AlertTitle>{t("ACTION_FAILED")}</AlertTitle>
      <AlertDescription>{t(messageKey)}</AlertDescription>
    </Alert>
  );
}

function PermissionSelector({
  permissions,
  selected,
  setSelected,
}: Readonly<{
  permissions: readonly PlatformPermissionCatalogItemOut[];
  selected: ReadonlySet<string>;
  setSelected: (value: ReadonlySet<string>) => void;
}>) {
  const { t } = useTranslation("access");
  const delegable = permissions.filter((permission) => permission.isDelegable);
  return (
    <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border p-3">
      {delegable.map((permission) => (
        <label className="flex items-start gap-3" key={permission.code}>
          <Checkbox
            checked={selected.has(permission.code)}
            onCheckedChange={(checked) => {
              const next = new Set(selected);
              if (checked) next.add(permission.code);
              else next.delete(permission.code);
              setSelected(next);
            }}
          />
          <span>
            <span className="block text-sm font-medium">{permission.nameI18N}</span>
            <span className="block text-xs text-muted-foreground">
              {permission.descriptionI18N}
            </span>
          </span>
        </label>
      ))}
      {!delegable.length ? (
        <p className="text-sm text-muted-foreground">{t("NO_DELEGABLE_PERMISSIONS")}</p>
      ) : null}
    </div>
  );
}

type CreateRoleDialogProps = RoleDialogProps &
  Readonly<{ sourceRole?: PlatformRoleCatalogItemOut }>;

export function CreateRoleDialog(props: CreateRoleDialogProps) {
  const { t } = useTranslation("access");
  const [code, setCode] = useState("");
  const [name, setName] = useState(
    props.sourceRole ? t("ROLE_COPY_NAME", { name: props.sourceRole.name }) : "",
  );
  const [description, setDescription] = useState(props.sourceRole?.description ?? "");
  const [permissionCodes, setPermissionCodes] = useState<ReadonlySet<string>>(
    new Set(props.sourceRole?.permissionCodes ?? []),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roleId = useRef(crypto.randomUUID());
  const request = useRef<MutationAttempt | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const selectedCodes = [...permissionCodes].sort();
    const normalizedCode = code.trim();
    const normalizedName = name.trim();
    if (!normalizedCode || !normalizedName || !selectedCodes.length) return;
    const normalizedDescription = description.trim() || null;
    const fingerprint = JSON.stringify([
      roleId.current,
      normalizedCode,
      normalizedName,
      normalizedDescription,
      selectedCodes,
      props.sourceRole?.roleId ?? null,
      props.sourceRole?.revisionId ?? null,
    ]);
    let attempt = mutationAttempt(request, fingerprint);
    const scope: PlatformStepUpProofIssueRequest["scope"] = props.sourceRole
      ? {
          code: normalizedCode,
          permission_codes: selectedCodes,
          source_revision_id: props.sourceRole.revisionId,
          source_role_id: props.sourceRole.roleId,
        }
      : { code: normalizedCode, permission_codes: selectedCodes };
    setPending(true);
    setError(null);
    try {
      if (!attempt.stepUpProof) {
        const stepUpProof = await verifyPlatformAction({
          actionCode: "platform.access.change_role",
          idempotencyKey: attempt.idempotencyKey,
          scope,
          targetId: roleId.current,
          targetType: "platform_role",
        });
        attempt = { ...attempt, stepUpProof };
        request.current = attempt;
      }
      const stepUpProof = attempt.stepUpProof;
      if (!stepUpProof) throw new Error("PLATFORM_STEP_UP_PROOF_REQUIRED");
      const base = {
        code: normalizedCode,
        correlationId: attempt.correlationId,
        description: normalizedDescription,
        idempotencyKey: attempt.idempotencyKey,
        name: normalizedName,
        permissionCodes: selectedCodes,
        roleId: roleId.current,
        stepUpProof,
      };
      if (props.sourceRole) {
        await copyPlatformCustomRole({
          ...base,
          expectedSourceRevisionId: props.sourceRole.revisionId,
          sourceRoleId: props.sourceRole.roleId,
        });
      } else {
        await createPlatformCustomRole(base);
      }
      if (request.current === attempt) request.current = null;
      props.onCompleted(props.sourceRole ? "ROLE_COPIED" : "ROLE_CREATED");
      props.onOpenChange(false);
    } catch (caught) {
      setError(errorKey(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      title={t(props.sourceRole ? "COPY_ROLE" : "CREATE_ROLE")}
      description={t(props.sourceRole ? "COPY_ROLE_DESCRIPTION" : "CREATE_ROLE_DESCRIPTION")}
      footer={
        <>
          <Button disabled={pending} variant="outline" onClick={() => props.onOpenChange(false)}>
            {t("CANCEL")}
          </Button>
          <Button
            disabled={pending || !code.trim() || !name.trim() || !permissionCodes.size}
            form="create-platform-role"
            type="submit"
          >
            {pending ? t("VERIFYING") : t("VERIFY_AND_CREATE_ROLE")}
          </Button>
        </>
      }
    >
      <form id="create-platform-role" onSubmit={submit}>
        <SettingDialogFields>
          {error ? <MutationError messageKey={error} /> : null}
          <SettingDialogField title={<label htmlFor="platform-role-name">{t("ROLE_NAME")}</label>}>
            <Input
              id="platform-role-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </SettingDialogField>
          <SettingDialogField
            title={<label htmlFor="platform-role-code">{t("ROLE_CODE")}</label>}
            description={t("ROLE_CODE_HELP")}
          >
            <Input
              id="platform-role-code"
              pattern="[a-z][a-z0-9_-]*"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </SettingDialogField>
          <SettingDialogField
            title={<label htmlFor="platform-role-description">{t("ROLE_DESCRIPTION_LABEL")}</label>}
          >
            <Textarea
              id="platform-role-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </SettingDialogField>
          <SettingDialogField
            title={t("ROLE_PERMISSIONS")}
            description={t("ROLE_PERMISSIONS_HELP")}
          >
            <PermissionSelector
              permissions={props.permissions}
              selected={permissionCodes}
              setSelected={setPermissionCodes}
            />
          </SettingDialogField>
          <p className="text-sm text-muted-foreground">{t("SECURITY_KEY_REQUIRED")}</p>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

type ExistingRoleDialogProps = RoleDialogProps & Readonly<{ role: PlatformRoleCatalogItemOut }>;

export function EditRoleDialog(props: ExistingRoleDialogProps) {
  const { t } = useTranslation("access");
  const [name, setName] = useState(props.role.name);
  const [description, setDescription] = useState(props.role.description ?? "");
  const [permissionCodes, setPermissionCodes] = useState<ReadonlySet<string>>(
    new Set(props.role.permissionCodes),
  );
  const [preview, setPreview] = useState<PlatformCustomRolePreviewOut | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const applyRequest = useRef<MutationAttempt | null>(null);

  const review = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      setPreview(
        await previewPlatformCustomRoleRevision(props.role.roleId, {
          description: description.trim() || null,
          expectedRoleRevisionId: props.role.revisionId,
          name: name.trim(),
          permissionCodes: [...permissionCodes].sort(),
        }),
      );
    } catch (caught) {
      setError(errorKey(caught));
    } finally {
      setPending(false);
    }
  };

  const apply = async () => {
    if (!preview) return;
    const fingerprint = JSON.stringify([
      props.role.roleId,
      props.role.revisionId,
      preview.previewId,
      preview.expectedRoleRevisionId,
    ]);
    let attempt = mutationAttempt(applyRequest, fingerprint);
    const scope = { expected_role_revision_id: preview.expectedRoleRevisionId };
    setPending(true);
    setError(null);
    try {
      if (!attempt.stepUpProof) {
        const stepUpProof = await verifyPlatformAction({
          actionCode: "platform.access.change_role",
          idempotencyKey: attempt.idempotencyKey,
          scope,
          targetId: preview.previewId,
          targetType: "platform_role_preview",
        });
        attempt = { ...attempt, stepUpProof };
        applyRequest.current = attempt;
      }
      const stepUpProof = attempt.stepUpProof;
      if (!stepUpProof) throw new Error("PLATFORM_STEP_UP_PROOF_REQUIRED");
      await applyPlatformCustomRoleRevision({
        correlationId: attempt.correlationId,
        expectedRoleRevisionId: preview.expectedRoleRevisionId,
        idempotencyKey: attempt.idempotencyKey,
        previewId: preview.previewId,
        stepUpProof,
      });
      if (applyRequest.current === attempt) applyRequest.current = null;
      props.onCompleted("ROLE_UPDATED");
      props.onOpenChange(false);
    } catch (caught) {
      setError(errorKey(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      title={t("EDIT_ROLE")}
      description={t("EDIT_ROLE_DESCRIPTION", { name: props.role.name })}
      footer={
        <>
          <Button disabled={pending} variant="outline" onClick={() => props.onOpenChange(false)}>
            {t("CANCEL")}
          </Button>
          {preview ? (
            <Button disabled={pending} onClick={apply}>
              {pending ? t("VERIFYING") : t("VERIFY_AND_APPLY_ROLE")}
            </Button>
          ) : (
            <Button
              disabled={pending || !name.trim() || !permissionCodes.size}
              form="edit-platform-role"
              type="submit"
            >
              {pending ? t("REVIEWING") : t("REVIEW_ROLE_CHANGE")}
            </Button>
          )}
        </>
      }
    >
      {error ? <MutationError messageKey={error} /> : null}
      {preview ? (
        <RolePreview preview={preview} />
      ) : (
        <form id="edit-platform-role" onSubmit={review}>
          <SettingDialogFields>
            <SettingDialogField title={<label htmlFor="edit-role-name">{t("ROLE_NAME")}</label>}>
              <Input
                id="edit-role-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </SettingDialogField>
            <SettingDialogField
              title={<label htmlFor="edit-role-description">{t("ROLE_DESCRIPTION_LABEL")}</label>}
            >
              <Textarea
                id="edit-role-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </SettingDialogField>
            <SettingDialogField
              title={t("ROLE_PERMISSIONS")}
              description={t("ROLE_PERMISSIONS_HELP")}
            >
              <PermissionSelector
                permissions={props.permissions}
                selected={permissionCodes}
                setSelected={setPermissionCodes}
              />
            </SettingDialogField>
          </SettingDialogFields>
        </form>
      )}
    </SettingDialog>
  );
}

function RolePreview({ preview }: Readonly<{ preview: PlatformCustomRolePreviewOut }>) {
  const { t } = useTranslation("access");
  const rows = [
    ["ADDED_PERMISSIONS", preview.addedPermissionCodes.length],
    ["REMOVED_PERMISSIONS", preview.removedPermissionCodes.length],
    ["AFFECTED_OPERATORS", preview.affectedOperatorIds.length],
    ["INVALIDATED_INVITATIONS", preview.invalidatedInvitationCount],
    ["SELF_ACCESS_CHANGES", preview.actorLosesPermissions.length],
  ] as const;
  return (
    <SettingDialogFields>
      <Alert>
        <AlertTitle>{t("ROLE_CHANGE_IMPACT")}</AlertTitle>
        <AlertDescription>{t("ROLE_CHANGE_IMPACT_DESCRIPTION")}</AlertDescription>
      </Alert>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map(([key, count]) => (
          <div className="rounded-lg border p-3" key={key}>
            <p className="text-sm text-muted-foreground">{t(key)}</p>
            <p className="mt-1 text-2xl-3 font-semibold">{count}</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{t("SECURITY_KEY_REQUIRED")}</p>
    </SettingDialogFields>
  );
}

export function RetireRoleDialog(props: ExistingRoleDialogProps) {
  const { t } = useTranslation("access");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<MutationAttempt | null>(null);

  const retire = async () => {
    const scope = { expected_role_revision_id: props.role.revisionId };
    let attempt = mutationAttempt(
      request,
      JSON.stringify([props.role.roleId, props.role.revisionId]),
    );
    setPending(true);
    setError(null);
    try {
      if (!attempt.stepUpProof) {
        const stepUpProof = await verifyPlatformAction({
          actionCode: "platform.access.change_role",
          idempotencyKey: attempt.idempotencyKey,
          scope,
          targetId: props.role.roleId,
          targetType: "platform_role",
        });
        attempt = { ...attempt, stepUpProof };
        request.current = attempt;
      }
      const stepUpProof = attempt.stepUpProof;
      if (!stepUpProof) throw new Error("PLATFORM_STEP_UP_PROOF_REQUIRED");
      await retirePlatformCustomRole(props.role.roleId, {
        correlationId: attempt.correlationId,
        expectedRoleRevisionId: props.role.revisionId,
        idempotencyKey: attempt.idempotencyKey,
        stepUpProof,
      });
      if (request.current === attempt) request.current = null;
      props.onCompleted("ROLE_RETIRED");
      props.onOpenChange(false);
    } catch (caught) {
      setError(errorKey(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      title={t("RETIRE_ROLE_TITLE")}
      description={t("RETIRE_ROLE_DESCRIPTION", { name: props.role.name })}
      footer={
        <>
          <Button disabled={pending} variant="outline" onClick={() => props.onOpenChange(false)}>
            {t("CANCEL")}
          </Button>
          <Button disabled={pending} variant="destructive" onClick={retire}>
            {pending ? t("VERIFYING") : t("VERIFY_AND_RETIRE_ROLE")}
          </Button>
        </>
      }
    >
      {error ? <MutationError messageKey={error} /> : null}
      <p className="text-sm text-muted-foreground">{t("RETIRE_ROLE_CONSEQUENCE")}</p>
      <p className="mt-3 text-sm text-muted-foreground">{t("SECURITY_KEY_REQUIRED")}</p>
    </SettingDialog>
  );
}
