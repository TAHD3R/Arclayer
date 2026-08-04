import { useMemo, useRef, useState, type FormEvent, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
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
import { localizePlatformPermission } from "@/access/platform-permission-copy";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SettingDialog } from "@/components/setting-dialog";
import { SettingDrawer } from "@/components/setting-drawer";
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
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return delegable;
    return delegable.filter((permission) => {
      const copy = localizePlatformPermission(permission.code, t);
      return [permission.code, permission.ownerDomain, copy.name, copy.description]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalized);
    });
  }, [delegable, query, t]);
  const groups = useMemo(() => {
    const grouped = new Map<string, PlatformPermissionCatalogItemOut[]>();
    for (const permission of visible) {
      grouped.set(permission.ownerDomain, [
        ...(grouped.get(permission.ownerDomain) ?? []),
        permission,
      ]);
    }
    return grouped;
  }, [visible]);

  const selectVisible = () => {
    setSelected(new Set([...selected, ...visible.map((permission) => permission.code)]));
  };
  const invertVisible = () => {
    const next = new Set(selected);
    for (const permission of visible) {
      if (next.has(permission.code)) next.delete(permission.code);
      else next.add(permission.code);
    }
    setSelected(next);
  };

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="relative border-b">
        <Search
          aria-hidden="true"
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          className="rounded-none border-0 pl-9 shadow-none focus-visible:ring-0"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("ROLE_PERMISSION_SEARCH_PLACEHOLDER")}
          value={query}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {t("ROLE_PERMISSION_SELECTION_COUNT", {
            selected: selected.size,
            visible: visible.length,
          })}
        </span>
        <div className="flex gap-2">
          <Button
            disabled={!visible.length}
            onClick={selectVisible}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("SELECT_ALL_VISIBLE")}
          </Button>
          <Button
            disabled={!visible.length}
            onClick={invertVisible}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("INVERT_VISIBLE_SELECTION")}
          </Button>
        </div>
      </div>
      <div className="max-h-72 overflow-y-auto p-2">
        {visible.length ? (
          [...groups.entries()].map(([domain, items]) => (
            <section className="space-y-1 py-1" key={domain}>
              <p className="px-2 py-1 text-xs font-medium text-muted-foreground">{domain}</p>
              {items.map((permission) => {
                const copy = localizePlatformPermission(permission.code, t);
                const checked = selected.has(permission.code);
                return (
                  <label
                    className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-accent"
                    key={permission.code}
                  >
                    <Checkbox
                      aria-label={copy.name}
                      checked={checked}
                      onCheckedChange={(value) => {
                        const next = new Set(selected);
                        if (value) next.add(permission.code);
                        else next.delete(permission.code);
                        setSelected(next);
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{copy.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {copy.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </section>
          ))
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("NO_DELEGABLE_PERMISSIONS_MATCH")}
          </p>
        )}
      </div>
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
    <SettingDrawer
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
              placeholder={t("ROLE_NAME_PLACEHOLDER")}
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
              placeholder={t("ROLE_CODE_PLACEHOLDER")}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </SettingDialogField>
          <SettingDialogField
            title={<label htmlFor="platform-role-description">{t("ROLE_DESCRIPTION_LABEL")}</label>}
          >
            <Textarea
              id="platform-role-description"
              placeholder={t("ROLE_DESCRIPTION_PLACEHOLDER")}
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
    </SettingDrawer>
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
    <SettingDrawer
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
                placeholder={t("ROLE_NAME_PLACEHOLDER")}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </SettingDialogField>
            <SettingDialogField
              title={<label htmlFor="edit-role-description">{t("ROLE_DESCRIPTION_LABEL")}</label>}
            >
              <Textarea
                id="edit-role-description"
                placeholder={t("ROLE_DESCRIPTION_PLACEHOLDER")}
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
    </SettingDrawer>
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
