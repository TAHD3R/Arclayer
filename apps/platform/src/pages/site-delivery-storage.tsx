import { Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  PageDataPlatformDeliveryStorageOut,
  StorageProfileOut,
} from "@arclayer/platform-openapi";

import {
  type DeliveryOperationRequest,
  getDeliveryStorageDossier,
  listDeliveryStorage,
  listStorageProfiles,
  testDeliveryStorage,
} from "@/site-delivery/site-delivery-api";
import {
  DeleteStorageProfileDialog,
  StorageProfileEditorDialog,
} from "@/site-delivery/storage-profile-dialogs";
import { SiteDeliveryOperationsSheet } from "@/site-delivery/site-delivery-operations-sheet";
import {
  ActionFeedbackNotice,
  actionFailure,
  type ActionFeedback,
  deliveryOperationRequest,
  discardStaleOperationRequest,
  SiteDeliveryPage,
  SiteDeliveryState,
} from "@/site-delivery/site-delivery-page-state";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type StoragePageData = Readonly<{
  delivery: PageDataPlatformDeliveryStorageOut;
  profiles: readonly StorageProfileOut[];
}>;

export function SiteDeliveryStoragePage() {
  const { t } = useTranslation("siteDelivery");
  const load = useCallback(async (): Promise<StoragePageData> => {
    const [delivery, profiles] = await Promise.all([listDeliveryStorage(), listStorageProfiles()]);
    return { delivery, profiles: profiles.items ?? [] };
  }, []);
  const { state, retry } = useMonitoringQuery(load, []);
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [successKey, setSuccessKey] = useState<string | null>(null);
  const [profileAction, setProfileAction] = useState<
    "create" | Readonly<{ kind: "edit" | "delete"; profile: StorageProfileOut }> | null
  >(null);
  const [operationsScope, setOperationsScope] = useState<{
    kind: "storage";
    id: string;
    name: string;
  } | null>(null);
  const operationRequests = useRef<Map<string, DeliveryOperationRequest>>(new Map());
  const testStorage = async (profileId: string) => {
    const operationKey = `${profileId}:test`;
    setPending(profileId);
    setFeedback(null);
    try {
      const request =
        operationRequests.current.get(operationKey) ??
        deliveryOperationRequest(
          operationRequests.current,
          operationKey,
          (await getDeliveryStorageDossier(profileId)).revision,
        );
      const result = await testDeliveryStorage(profileId, request);
      operationRequests.current.delete(operationKey);
      setFeedback({ kind: "storage", result });
      retry();
    } catch (error) {
      discardStaleOperationRequest(operationRequests.current, operationKey, error);
      setFeedback({ kind: "error", failure: actionFailure(error) });
    } finally {
      setPending(null);
    }
  };

  return (
    <SiteDeliveryPage description={t("STORAGE_DESCRIPTION")} title={t("STORAGE_TITLE")}>
      <div className="flex justify-end">
        <Button onClick={() => setProfileAction("create")}>
          <Plus aria-hidden="true" />
          {t("CREATE_STORAGE_PROFILE")}
        </Button>
      </div>
      {successKey ? (
        <Alert>
          <AlertDescription>{t(successKey)}</AlertDescription>
        </Alert>
      ) : null}
      <ActionFeedbackNotice feedback={feedback} />
      <SiteDeliveryState
        empty={(data: StoragePageData) => !data.profiles.length}
        retry={retry}
        state={state}
      >
        {(data) => (
          <Card>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("PROFILE")}</TableHead>
                    <TableHead>{t("PROVIDER")}</TableHead>
                    <TableHead>{t("STATUS")}</TableHead>
                    <TableHead>{t("ACTIONS")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.profiles.map((profile) => {
                    const delivery = data.delivery.items?.find((item) => item.id === profile.id);
                    const editable = profile.configSource === "database";
                    return (
                      <TableRow key={profile.id}>
                        <TableCell>
                          <p>{profile.displayName}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {profile.profileKey}
                          </p>
                        </TableCell>
                        <TableCell>
                          {t(`STORAGE_PROVIDER_${profile.provider.toUpperCase()}`)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              (delivery?.lastTestStatus ?? profile.lastTestStatus) === "failed"
                                ? "destructive"
                                : "outline"
                            }
                          >
                            {t(
                              (delivery?.lastTestStatus ?? profile.lastTestStatus) === "passed"
                                ? "STORAGE_STATUS_PASSED"
                                : (delivery?.lastTestStatus ?? profile.lastTestStatus) === "failed"
                                  ? "STORAGE_STATUS_FAILED"
                                  : "NOT_TESTED",
                            )}
                          </Badge>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {profile.isDefault ? t("DEFAULT_STORAGE") : t("NON_DEFAULT_STORAGE")}
                          </p>
                          {!editable ? (
                            <p className="text-xs text-muted-foreground">
                              {t("STORAGE_ENVIRONMENT_MANAGED")}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              disabled={pending === profile.id}
                              onClick={() => void testStorage(profile.id)}
                              size="sm"
                              variant="secondary"
                            >
                              {pending === profile.id ? t("WORKING") : t("TEST_STORAGE")}
                            </Button>
                            <Button
                              disabled={!editable}
                              size="sm"
                              variant="outline"
                              onClick={() => setProfileAction({ kind: "edit", profile })}
                            >
                              <Pencil aria-hidden="true" />
                              {t("EDIT")}
                            </Button>
                            <Button
                              disabled={!editable || profile.isDefault}
                              size="sm"
                              variant="ghost"
                              onClick={() => setProfileAction({ kind: "delete", profile })}
                            >
                              <Trash2 aria-hidden="true" />
                              {t("DELETE")}
                            </Button>
                            <Button
                              onClick={() =>
                                setOperationsScope({
                                  kind: "storage",
                                  id: profile.id,
                                  name: profile.displayName,
                                })
                              }
                              size="sm"
                              variant="ghost"
                            >
                              {t("OPERATIONS_LINK")}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </SiteDeliveryState>
      {profileAction === "create" ? (
        <StorageProfileEditorDialog
          open
          onCompleted={(messageKey) => {
            setSuccessKey(messageKey);
            retry();
          }}
          onOpenChange={(open) => !open && setProfileAction(null)}
        />
      ) : null}
      {profileAction && typeof profileAction === "object" && profileAction.kind === "edit" ? (
        <StorageProfileEditorDialog
          open
          onCompleted={(messageKey) => {
            setSuccessKey(messageKey);
            retry();
          }}
          onOpenChange={(open) => !open && setProfileAction(null)}
          profile={profileAction.profile}
        />
      ) : null}
      {profileAction && typeof profileAction === "object" && profileAction.kind === "delete" ? (
        <DeleteStorageProfileDialog
          open
          onCompleted={(messageKey) => {
            setSuccessKey(messageKey);
            retry();
          }}
          onOpenChange={(open) => !open && setProfileAction(null)}
          profile={profileAction.profile}
        />
      ) : null}
      {operationsScope ? (
        <SiteDeliveryOperationsSheet
          onClose={() => setOperationsScope(null)}
          scope={operationsScope}
        />
      ) : null}
    </SiteDeliveryPage>
  );
}
