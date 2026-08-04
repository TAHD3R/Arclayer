import { KeyRound, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  PlatformMfaMethodReadinessOut,
  PlatformMfaReadinessOut,
} from "@arclayer/platform-openapi";
import { toast } from "sonner";

import {
  AddAuthenticatorAppDialog,
  AddSecurityKeyDialog,
  RemoveMfaMethodDialog,
} from "@/access/platform-mfa-dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/monitoring/format";

type MfaAction =
  | Readonly<{
      type: "enroll";
      kind: "totp" | "webauthn";
      replaceMethod?: PlatformMfaMethodReadinessOut;
    }>
  | Readonly<{ type: "remove"; method: PlatformMfaMethodReadinessOut }>
  | null;

export function PlatformMfaSettings({
  readiness,
  onChanged,
}: Readonly<{
  readiness: PlatformMfaReadinessOut;
  onChanged: () => void;
}>) {
  const { t } = useTranslation("access");
  const [action, setAction] = useState<MfaAction>(null);
  const completed = (messageKey: string) => {
    toast.success(t(messageKey));
    onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => setAction({ kind: "totp", type: "enroll" })}>
          <Plus aria-hidden="true" />
          {t("ADD_AUTHENTICATOR_APP")}
        </Button>
        <Button onClick={() => setAction({ kind: "webauthn", type: "enroll" })}>
          <KeyRound aria-hidden="true" />
          {t("ADD_SECURITY_KEY")}
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="size-5 text-primary" />
            {t("MFA_TITLE")}
          </CardTitle>
          <CardDescription>{t("MFA_DESCRIPTION")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Badge variant={readiness.ready ? "secondary" : "outline"}>
            {t(readiness.ready ? "MFA_READY" : "MFA_SETUP_REQUIRED")}
          </Badge>
          {readiness.methods.length ? (
            readiness.methods.map((method) => (
              <article
                className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between"
                key={method.methodId}
              >
                <div>
                  <p className="font-medium">
                    {method.label ?? t(`MFA_KIND_${method.kind.toUpperCase()}`)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("VERIFIED_AT", {
                      date: method.verifiedAt
                        ? formatDateTime(method.verifiedAt)
                        : t("UNAVAILABLE"),
                    })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setAction({
                        kind: method.kind === "totp" ? "totp" : "webauthn",
                        replaceMethod: method,
                        type: "enroll",
                      })
                    }
                  >
                    <Pencil aria-hidden="true" />
                    {t("REPLACE_MFA_METHOD")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAction({ method, type: "remove" })}
                  >
                    <Trash2 aria-hidden="true" />
                    {t("REMOVE_MFA_METHOD")}
                  </Button>
                </div>
              </article>
            ))
          ) : (
            <p className="text-base text-muted-foreground">{t("MFA_EMPTY")}</p>
          )}
          {readiness.availableRecoveryCodeCount !== null ? (
            <p className="text-sm text-muted-foreground">
              {t("RECOVERY_CODES_REMAINING", { count: readiness.availableRecoveryCodeCount })}
            </p>
          ) : null}
        </CardContent>
      </Card>
      {action?.type === "enroll" && action.kind === "totp" ? (
        <AddAuthenticatorAppDialog
          open
          methods={readiness.methods}
          onCompleted={completed}
          onOpenChange={(open) => !open && setAction(null)}
          replaceMethod={action.replaceMethod}
          userId={readiness.userId}
        />
      ) : null}
      {action?.type === "enroll" && action.kind === "webauthn" ? (
        <AddSecurityKeyDialog
          open
          methods={readiness.methods}
          onCompleted={completed}
          onOpenChange={(open) => !open && setAction(null)}
          replaceMethod={action.replaceMethod}
          userId={readiness.userId}
        />
      ) : null}
      {action?.type === "remove" ? (
        <RemoveMfaMethodDialog
          method={action.method}
          methods={readiness.methods}
          open
          onCompleted={completed}
          onOpenChange={(open) => !open && setAction(null)}
          userId={readiness.userId}
        />
      ) : null}
    </div>
  );
}
