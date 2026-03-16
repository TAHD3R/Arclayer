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

type Translate = (key: string, opts?: Record<string, unknown>) => string;

type CreateRoleDialogProps = {
  open: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
  templateRoleCode: string;
  roleName: string;
  roleDescription: string;
  onTemplateRoleCodeChange: (roleCode: string) => void;
  onRoleNameChange: (value: string) => void;
  onRoleDescriptionChange: (value: string) => void;
  roleOptions: Array<{ value: string; label: string }>;
  t: Translate;
};

export function CreateRoleDialog(props: CreateRoleDialogProps) {
  const {
    open,
    onOpenChange,
    onCancel,
    onConfirm,
    submitting,
    templateRoleCode,
    roleName,
    roleDescription,
    onTemplateRoleCodeChange,
    onRoleNameChange,
    onRoleDescriptionChange,
    roleOptions,
    t,
  } = props;

  return (
    <SettingDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("team:TEAM_ROLES_ADD_ROLE_DIALOG_TITLE")}
      description={t("team:TEAM_ROLES_ADD_ROLE_DIALOG_DESC")}
      contentClassName="max-w-[640px]"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            {t("common:CANCEL")}
          </Button>
          <Button loading={submitting} onClick={onConfirm} disabled={!roleName.trim()}>
            {t("common:CONFIRM")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground">
            {t("team:TEAM_ROLES_FIELD_TEMPLATE")}
          </label>
          <div className="text-label-secondary">{t("team:TEAM_ROLES_FIELD_TEMPLATE_HELP")}</div>
          <Select value={templateRoleCode} onValueChange={onTemplateRoleCodeChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("team:TEAM_ROLES_FIELD_TEMPLATE_PLACEHOLDER")} />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              {roleOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground">{t("team:TEAM_ROLES_FIELD_NAME")}</label>
          <div className="text-label-secondary">{t("team:TEAM_ROLES_FIELD_NAME_HELP")}</div>
          <Input
            value={roleName}
            onChange={(event) => onRoleNameChange(event.target.value)}
            placeholder={t("team:TEAM_ROLES_FIELD_NAME")}
          />
        </div>

        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground">{t("team:TEAM_ROLES_FIELD_DESC")}</label>
          <div className="text-label-secondary">{t("team:TEAM_ROLES_FIELD_DESC_HELP")}</div>
          <Textarea
            value={roleDescription}
            onChange={(event) => onRoleDescriptionChange(event.target.value)}
            className="min-h-28"
            placeholder={t("team:TEAM_ROLES_FIELD_DESC")}
          />
        </div>
      </div>
    </SettingDialog>
  );
}

type DeleteRoleDialogProps = {
  open: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
  roleName: string;
  submitting: boolean;
  t: Translate;
};

export function DeleteRoleDialog(props: DeleteRoleDialogProps) {
  const { open, onOpenChange, onCancel, onConfirm, roleName, submitting, t } = props;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) onCancel();
      }}
    >
      <AlertDialogContent className="sm:max-w-[520px]">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("team:TEAM_ROLES_DELETE_TITLE")}</AlertDialogTitle>
          <AlertDialogDescription className="text-body">
            {t("team:TEAM_ROLES_DELETE_DESC", { roleName })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancelPrimitive asChild>
            <Button variant="ghost" onClick={onCancel} disabled={submitting}>
              {t("common:CANCEL")}
            </Button>
          </AlertDialogCancelPrimitive>
          <AlertDialogActionPrimitive asChild>
            <Button variant="destructive" loading={submitting} onClick={onConfirm}>
              {t("team:TEAM_ACTION_DELETE")}
            </Button>
          </AlertDialogActionPrimitive>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
