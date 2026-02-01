"use client";

import { Button as AntButton, Divider } from "antd";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";

import type { TeamMember } from "@/api/team";
import { patchTeamMemberUser } from "@/api/team";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/animate-ui/components/radix/sheet";
import { Input } from "@/components/ui/input";
import { zodResolver } from "@/lib/forms/zodResolver";
import { notifyError, notifySuccessText } from "@/utils/notifications";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

type FormValues = {
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string;
};

function normalizeOptionalString(input: string): string | null {
  const v = String(input || "").trim();
  return v ? v : null;
}

export function EditUserSheet(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: TeamMember | null;
  onSaved?: () => void;
}) {
  const { t } = useTranslation(["team", "common"]);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const schema = React.useMemo(() => {
    const max = (n: number) => t("team:TEAM_VALIDATION_MAX_LENGTH", { max: n });

    return z.object({
      username: z.string().trim(),
      displayName: z.string().trim().max(64, max(64)),
      email: z
        .string()
        .trim()
        .max(255, max(255))
        .superRefine((v, ctx) => {
          if (!v) return;
          if (!z.string().email().safeParse(v).success) {
            ctx.addIssue({ code: "custom", message: t("team:TEAM_VALIDATION_EMAIL_INVALID") });
          }
        }),
      avatarUrl: z.string().trim().max(512, max(512)),
    });
  }, [t]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: "",
      displayName: "",
      email: "",
      avatarUrl: "",
    },
    mode: "onSubmit",
  });

  React.useEffect(() => {
    const m = props.member;
    if (!m) return;
    form.reset({
      username: m.username ?? "",
      displayName: m.displayName ?? "",
      email: m.email ?? "",
      avatarUrl: m.avatarUrl ?? "",
    });
  }, [form, props.member]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const member = props.member;
      if (!member) return null;
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return patchTeamMemberUser(workspaceId, member.membershipId, {
        displayName: normalizeOptionalString(values.displayName),
        email: normalizeOptionalString(values.email),
        avatarUrl: normalizeOptionalString(values.avatarUrl),
      });
    },
    onSuccess: () => {
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
      props.onSaved?.();
      props.onOpenChange(false);
    },
    onError: (err) => notifyError(err),
  });

  const onSubmit = form.handleSubmit(async (values) => {
    await mutation.mutateAsync(values);
  });

  const title = props.member
    ? t("team:TEAM_EDIT_USER_TITLE", { username: props.member.username })
    : t("team:TEAM_EDIT_USER_TITLE_FALLBACK");

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="right" className="w-[460px] sm:w-[520px]">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{t("team:TEAM_EDIT_USER_DESC")}</SheetDescription>
        </SheetHeader>

        <Divider className="my-0" />

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col gap-4 px-4">
          <div className="grid gap-1.5">
            <label className="text-sm text-muted-foreground" htmlFor="username">
              {t("team:TEAM_FIELD_USERNAME")}
            </label>
            <Input id="username" disabled {...form.register("username")} />
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm text-muted-foreground" htmlFor="displayName">
              {t("team:TEAM_FIELD_DISPLAY_NAME")}
            </label>
            <Input
              id="displayName"
              placeholder={t("team:TEAM_FIELD_DISPLAY_NAME_PLACEHOLDER")}
              {...form.register("displayName")}
            />
            {form.formState.errors.displayName?.message ? (
              <div className="text-sm text-destructive">
                {String(form.formState.errors.displayName.message)}
              </div>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm text-muted-foreground" htmlFor="email">
              {t("team:TEAM_FIELD_EMAIL")}
            </label>
            <Input
              id="email"
              placeholder={t("team:TEAM_FIELD_EMAIL_PLACEHOLDER")}
              {...form.register("email")}
            />
            {form.formState.errors.email?.message ? (
              <div className="text-sm text-destructive">
                {String(form.formState.errors.email.message)}
              </div>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm text-muted-foreground" htmlFor="avatarUrl">
              {t("team:TEAM_FIELD_AVATAR_URL")}
            </label>
            <Input
              id="avatarUrl"
              placeholder={t("team:TEAM_FIELD_AVATAR_URL_PLACEHOLDER")}
              {...form.register("avatarUrl")}
            />
            {form.formState.errors.avatarUrl?.message ? (
              <div className="text-sm text-destructive">
                {String(form.formState.errors.avatarUrl.message)}
              </div>
            ) : null}
          </div>
        </form>

        <SheetFooter>
          <div className="flex items-center justify-end gap-2">
            <AntButton onClick={() => props.onOpenChange(false)} disabled={mutation.isPending}>
              {t("common:CANCEL")}
            </AntButton>
            <AntButton type="primary" loading={mutation.isPending} onClick={() => void onSubmit()}>
              {t("common:CONFIRM")}
            </AntButton>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
