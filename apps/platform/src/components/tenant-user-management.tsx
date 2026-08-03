import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Ban, CheckCircle2, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AccessRestrictionAdminOut, DirectoryUserDetailOut } from "@arclayer/platform-openapi";

import { disableTenantUser, enableTenantUser } from "@/api/tenant-directory";
import { useCapabilityAccess } from "@/capabilities/capability-access";
import { TenantAccessRestrictionDialog } from "@/components/tenant-directory-mutation-dialogs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type Dialog = "disable" | "enable" | null;

export function TenantUserDossier(props: { item: DirectoryUserDetailOut; onChanged: () => void }) {
  const { t, i18n } = useTranslation("tenants");
  const capability = useCapabilityAccess("tenant-governance");
  const [user, setUser] = useState(props.item);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [resultKey, setResultKey] = useState<string | null>(null);
  const restriction = activeRestriction(user);
  const label = userLabel(user);
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(value),
    );
  const saved = (next: DirectoryUserDetailOut, messageKey: string) => {
    setUser(next);
    setResultKey(messageKey);
    props.onChanged();
  };

  return (
    <div className="grid gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-2xl3 font-semibold">{label}</h2>
          <p className="mt-1 truncate text-base text-muted-foreground">{user.username}</p>
        </div>
        <UserState status={user.status} />
      </div>

      {resultKey ? (
        <Alert>
          <CheckCircle2 aria-hidden="true" />
          <AlertDescription>{t(resultKey)}</AlertDescription>
        </Alert>
      ) : null}

      <dl className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
        <Detail label={t("EMAIL")} value={user.email ?? t("UNAVAILABLE")} />
        <Detail
          label={t("SECURITY")}
          value={user.twoFactorEnabled ? t("TWO_FACTOR_ENABLED") : t("TWO_FACTOR_DISABLED")}
        />
        <Detail
          label={t("PASSWORD")}
          value={user.hasPassword ? t("PASSWORD_SET") : t("PASSWORD_NOT_SET")}
        />
        <Detail
          label={t("MEMBERSHIPS")}
          value={t("MEMBERSHIP_COUNTS", {
            workspaces: user.workspaceMembershipCount ?? 0,
            projects: user.projectMembershipCount ?? 0,
          })}
        />
        <Detail
          label={t("LAST_SIGN_IN")}
          value={user.lastLoginAt ? formatDate(user.lastLoginAt) : t("UNAVAILABLE")}
        />
        <Detail label={t("LAST_UPDATED")} value={formatDate(user.updatedAt)} />
      </dl>

      <Separator />
      <section className="grid gap-3" aria-labelledby="user-access-heading">
        <div>
          <h3 className="text-base" id="user-access-heading">
            {t("USER_ACCESS_STATE")}
          </h3>
          <p className="text-base text-muted-foreground">{t("USER_ACCESS_STATE_DESCRIPTION")}</p>
        </div>
        {restriction ? (
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">{t("RESTRICTION_USER_DISABLED")}</p>
              <Badge variant="destructive">{t("IN_EFFECT")}</Badge>
            </div>
            <p className="mt-2 text-base">{restriction.operatorNote}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("EFFECTIVE_SINCE", { date: formatDate(restriction.effectiveAt) })}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border bg-card p-3 text-base">
            <ShieldCheck
              aria-hidden="true"
              className="size-4 text-emerald-600 dark:text-emerald-400"
            />
            {t("USER_NO_ACTIVE_RESTRICTIONS")}
          </div>
        )}
      </section>

      {capability.canManage ? (
        restriction ? (
          <Button onClick={() => setDialog("enable")} variant="outline">
            <ShieldCheck aria-hidden="true" /> {t("ENABLE_ACTION")}
          </Button>
        ) : (
          <Button onClick={() => setDialog("disable")} variant="outline">
            <Ban aria-hidden="true" /> {t("DISABLE_ACTION")}
          </Button>
        )
      ) : null}

      <Link
        className="text-primary underline underline-offset-4"
        search={{ subjectUserId: user.userId }}
        to="/monitoring/audit"
      >
        {t("VIEW_RELATED_ACTIVITY")}
      </Link>

      {dialog === "disable" || dialog === "enable" ? (
        <TenantAccessRestrictionDialog
          action={dialog}
          activeRestriction={restriction}
          key={`${dialog}-${user.updatedAt}`}
          onEnforce={(body, idempotencyKey) => disableTenantUser(user.userId, body, idempotencyKey)}
          onLift={(body, idempotencyKey) => enableTenantUser(user.userId, body, idempotencyKey)}
          onOpenChange={(open) => !open && setDialog(null)}
          onSaved={(next) => saved(next, dialog === "disable" ? "USER_DISABLED" : "USER_ENABLED")}
          open
          subject="USER"
          subjectName={label}
        />
      ) : null}
    </div>
  );
}

function activeRestriction(user: DirectoryUserDetailOut): AccessRestrictionAdminOut | null {
  return (
    user.restrictions?.find(
      (restriction) =>
        restriction.restrictionType === "user_disabled" && restriction.state === "active",
    ) ?? null
  );
}

function userLabel(user: DirectoryUserDetailOut): string {
  return user.displayName?.trim() || user.username;
}

function UserState(props: { status: DirectoryUserDetailOut["status"] }) {
  const { t } = useTranslation("tenants");
  return (
    <Badge variant={props.status === "active" ? "secondary" : "destructive"}>
      {t(`STATUS_${props.status.toUpperCase()}`)}
    </Badge>
  );
}

function Detail(props: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{props.label}</dt>
      <dd className="mt-1 text-base">{props.value}</dd>
    </div>
  );
}
