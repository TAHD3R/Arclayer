import {
  Controller,
  type FieldErrors,
  type FieldValues,
  type UseFormReturn,
} from "react-hook-form";

import type { Role } from "@/types/api";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@arclayer/ui/alert-dialog";
import {
  AlertDialogAction as AlertDialogActionPrimitive,
  AlertDialogCancel as AlertDialogCancelPrimitive,
} from "@arclayer/ui/radix-primitives/radix-alert-dialog";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { Textarea } from "@arclayer/ui/textarea";

import type { CreateRoleFormValues, EditRoleFormValues } from "../utils";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

interface TeamRolesDialogsProps {
  t: TranslateFn;
  deleteOpen: boolean;
  setDeleteOpen: React.Dispatch<React.SetStateAction<boolean>>;
  deleteTarget: { code: string; name: string } | null;
  setDeleteTarget: React.Dispatch<React.SetStateAction<{ code: string; name: string } | null>>;
  deleteRolePending: boolean;
  onDeleteRoleConfirm: (roleCode: string) => Promise<void>;
  createOpen: boolean;
  setCreateOpen: React.Dispatch<React.SetStateAction<boolean>>;
  createForm: UseFormReturn<CreateRoleFormValues>;
  createErrors: FieldErrors<CreateRoleFormValues>;
  createRolePending: boolean;
  onCreateRoleSubmit: (values: CreateRoleFormValues) => void;
  editOpen: boolean;
  setEditOpen: (open: boolean) => void;
  editForm: UseFormReturn<EditRoleFormValues>;
  editErrors: FieldErrors<EditRoleFormValues>;
  editRolePending: boolean;
  onEditRoleSubmit: (values: EditRoleFormValues) => void;
  roles: Role[];
}

function RoleDetailsFields<
  TFormValues extends FieldValues & { name: string; description: string },
>(props: { t: TranslateFn; form: UseFormReturn<TFormValues>; errors: FieldErrors<TFormValues> }) {
  const { t, form, errors } = props;

  return (
    <>
      <div className="grid gap-1.5">
        <label className="font-semibold text-label-primary">
          {t("team:TEAM_ROLES_FIELD_NAME")}
        </label>
        <div className="text-label-secondary">{t("team:TEAM_ROLES_FIELD_NAME_HELP")}</div>
        <Controller
          name={"name" as never}
          control={form.control}
          render={({ field }) => (
            <Input value={field.value} onChange={(event) => field.onChange(event.target.value)} />
          )}
        />
        {errors.name?.message ? (
          <p className="text-caption text-destructive">{String(errors.name.message)}</p>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <label className="font-semibold text-label-primary">
          {t("team:TEAM_ROLES_FIELD_DESC")}
        </label>
        <div className="text-label-secondary">{t("team:TEAM_ROLES_FIELD_DESC_HELP")}</div>
        <Controller
          name={"description" as never}
          control={form.control}
          render={({ field }) => (
            <Textarea
              className="min-h-28"
              value={field.value}
              onChange={(event) => field.onChange(event.target.value)}
            />
          )}
        />
      </div>
    </>
  );
}

export function TeamRolesDialogs(props: TeamRolesDialogsProps) {
  const {
    t,
    deleteOpen,
    setDeleteOpen,
    deleteTarget,
    setDeleteTarget,
    deleteRolePending,
    onDeleteRoleConfirm,
    createOpen,
    setCreateOpen,
    createForm,
    createErrors,
    createRolePending,
    onCreateRoleSubmit,
    editOpen,
    setEditOpen,
    editForm,
    editErrors,
    editRolePending,
    onEditRoleSubmit,
    roles,
  } = props;

  return (
    <>
      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="sm:max-w-130">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("team:TEAM_ROLES_DELETE_TITLE")}</AlertDialogTitle>
            <AlertDialogDescription className="text-body">
              {t("team:TEAM_ROLES_DELETE_DESC", { roleName: deleteTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancelPrimitive asChild>
              <Button
                variant="ghost"
                onClick={() => {
                  setDeleteOpen(false);
                  setDeleteTarget(null);
                }}
                disabled={deleteRolePending}
              >
                {t("common:CANCEL")}
              </Button>
            </AlertDialogCancelPrimitive>
            <AlertDialogActionPrimitive asChild>
              <Button
                variant="destructive"
                loading={deleteRolePending}
                onClick={() => {
                  if (!deleteTarget?.code) return;
                  void onDeleteRoleConfirm(deleteTarget.code).then(() => {
                    setDeleteOpen(false);
                    setDeleteTarget(null);
                  });
                }}
              >
                {t("team:TEAM_ACTION_DELETE")}
              </Button>
            </AlertDialogActionPrimitive>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SettingDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t("team:TEAM_ROLES_ADD_ROLE_DIALOG_TITLE")}
        description={t("team:TEAM_ROLES_ADD_ROLE_DIALOG_DESC")}
        contentClassName="max-w-160"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setCreateOpen(false)}
              disabled={createRolePending}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              loading={createRolePending}
              onClick={() => void createForm.handleSubmit(onCreateRoleSubmit)()}
            >
              {t("common:CONFIRM")}
            </Button>
          </>
        }
      >
        <form className="grid gap-4" onSubmit={createForm.handleSubmit(onCreateRoleSubmit)}>
          <div className="grid gap-1.5">
            <label className="font-semibold text-label-primary">
              {t("team:TEAM_ROLES_FIELD_TEMPLATE")}
            </label>
            <div className="text-label-secondary">{t("team:TEAM_ROLES_FIELD_TEMPLATE_HELP")}</div>
            <Controller
              name="templateRoleCode"
              control={createForm.control}
              render={({ field }) => (
                <Select
                  value={field.value || "__none__"}
                  onValueChange={(value) => field.onChange(value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("team:TEAM_ROLES_FIELD_TEMPLATE_PLACEHOLDER")} />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start">
                    <SelectItem value="__none__">{t("team:TEAM_ROLES_TEMPLATE_NONE")}</SelectItem>
                    {roles.map((role) => (
                      <SelectItem key={role.code} value={role.code}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {createErrors.templateRoleCode?.message ? (
              <p className="text-caption text-destructive">
                {String(createErrors.templateRoleCode.message)}
              </p>
            ) : null}
          </div>

          <RoleDetailsFields t={t} form={createForm} errors={createErrors} />
        </form>
      </SettingDialog>

      <SettingDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={t("team:TEAM_ROLES_EDIT_ROLE_DIALOG_TITLE")}
        description={t("team:TEAM_ROLES_EDIT_ROLE_DIALOG_DESC")}
        contentClassName="max-w-160"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={editRolePending}>
              {t("common:CANCEL")}
            </Button>
            <Button
              loading={editRolePending}
              onClick={() => void editForm.handleSubmit(onEditRoleSubmit)()}
            >
              {t("common:CONFIRM")}
            </Button>
          </>
        }
      >
        <form className="grid gap-4" onSubmit={editForm.handleSubmit(onEditRoleSubmit)}>
          <RoleDetailsFields t={t} form={editForm} errors={editErrors} />
        </form>
      </SettingDialog>
    </>
  );
}
