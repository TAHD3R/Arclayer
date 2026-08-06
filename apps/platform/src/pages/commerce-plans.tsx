import { useCallback, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
  PlanRevisionTermsInput,
  PlatformCommercePlanCatalogOut,
} from "@arclayer/platform-openapi";

import {
  createCommercePlan,
  createPlanRevision,
  listCommercePlans,
  publishPlanRevision,
  updatePlanRevision,
} from "@/commerce/commerce-api";
import { CommercePage, CommerceQueryState } from "@/commerce/commerce-ui";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SettingDialog } from "@/components/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@/components/setting-dialog-field";
import { Textarea } from "@/components/ui/textarea";

const DEFAULT_TERMS = JSON.stringify(
  {
    creditGrantAmount: 0,
    creditRefreshInterval: "none",
    creditValueMicros: 0,
    currency: "USD",
    descriptionI18NKey: "commerce.plan.description",
    nameI18NKey: "commerce.plan.name",
  },
  null,
  2,
);

type IdempotencyAttempt = Readonly<{ fingerprint: string; key: string }>;

function idempotencyAttemptFor(
  current: IdempotencyAttempt | null,
  fingerprint: string,
): IdempotencyAttempt {
  return current?.fingerprint === fingerprint ? current : { fingerprint, key: crypto.randomUUID() };
}

export function CommercePlansPage() {
  const { t } = useTranslation("commerce");
  const [createOpen, setCreateOpen] = useState(false);
  const [draftPlanCode, setDraftPlanCode] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    planCode: string;
    revisionId: string;
    expectedRevision: number;
  } | null>(null);
  const load = useCallback(() => listCommercePlans({ includeInactive: true }), []);
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <CommercePage description={t("PLANS_DESCRIPTION")} title={t("PLANS_TITLE")}>
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>{t("CREATE_PLAN")}</Button>
      </div>
      <CommerceQueryState isEmpty={(data) => data.items.length === 0} retry={retry} state={state}>
        {(data) => (
          <PlanCards
            data={data}
            onCreateDraft={setDraftPlanCode}
            onEditDraft={setEditDraft}
            onPublished={retry}
          />
        )}
      </CommerceQueryState>
      <CreatePlanDialog onCompleted={retry} onOpenChange={setCreateOpen} open={createOpen} />
      <CreateDraftDialog
        onCompleted={retry}
        onOpenChange={(open) => !open && setDraftPlanCode(null)}
        open={draftPlanCode !== null}
        planCode={draftPlanCode}
      />
      <UpdateDraftDialog
        draft={editDraft}
        onCompleted={retry}
        onOpenChange={(open) => !open && setEditDraft(null)}
        open={editDraft !== null}
      />
    </CommercePage>
  );
}

function PlanCards(
  props: Readonly<{
    data: PlatformCommercePlanCatalogOut;
    onCreateDraft: (code: string) => void;
    onEditDraft: (draft: {
      planCode: string;
      revisionId: string;
      expectedRevision: number;
    }) => void;
    onPublished: () => void;
  }>,
) {
  const { t } = useTranslation("commerce");
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {props.data.items.map((plan) => (
        <Card key={plan.id}>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{plan.code}</CardTitle>
                <CardDescription>{plan.isActive ? t("ACTIVE") : t("INACTIVE")}</CardDescription>
              </div>
              <Badge variant={plan.isActive ? "secondary" : "outline"}>
                {plan.isActive ? t("ACTIVE") : t("INACTIVE")}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => props.onCreateDraft(plan.code)} size="sm" variant="outline">
              {t("CREATE_DRAFT")}
            </Button>
            {plan.revisions.length === 0 ? (
              <p className="text-base text-muted-foreground">{t("NO_REVISIONS")}</p>
            ) : (
              plan.revisions.map((revision) => (
                <PlanRevisionRow
                  key={revision.id}
                  onEditDraft={props.onEditDraft}
                  onPublished={props.onPublished}
                  planCode={plan.code}
                  revision={revision}
                />
              ))
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PlanRevisionRow(
  props: Readonly<{
    planCode: string;
    revision: PlatformCommercePlanCatalogOut["items"][number]["revisions"][number];
    onEditDraft: (draft: {
      planCode: string;
      revisionId: string;
      expectedRevision: number;
    }) => void;
    onPublished: () => void;
  }>,
) {
  const { t } = useTranslation("commerce");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const publishAttempt = useRef<IdempotencyAttempt | null>(null);
  const publish = async () => {
    const fingerprint = JSON.stringify([
      props.planCode,
      props.revision.id,
      props.revision.revision,
    ]);
    const attempt = idempotencyAttemptFor(publishAttempt.current, fingerprint);
    publishAttempt.current = attempt;
    setPending(true);
    setError(null);
    try {
      await publishPlanRevision(
        props.planCode,
        props.revision.id,
        { expectedRevision: props.revision.revision },
        attempt.key,
      );
      if (publishAttempt.current === attempt) publishAttempt.current = null;
      props.onPublished();
    } catch {
      setError(t("ACTION_ERROR"));
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{t("SEQUENCE", { sequence: props.revision.sequence })}</p>
          <p className="text-sm text-muted-foreground">
            {t(`REVISION_STATUS_${props.revision.status.toUpperCase()}`)}
            {props.revision.isSelling ? ` · ${t("SELLING")}` : ""}
          </p>
        </div>
        {props.revision.publishedAt && (
          <time className="text-sm text-muted-foreground">
            {new Date(props.revision.publishedAt).toLocaleDateString()}
          </time>
        )}
        {props.revision.status === "draft" ? (
          <div className="flex gap-2">
            <Button
              disabled={pending}
              onClick={() =>
                props.onEditDraft({
                  planCode: props.planCode,
                  revisionId: props.revision.id,
                  expectedRevision: props.revision.revision,
                })
              }
              size="sm"
              variant="outline"
            >
              {t("EDIT_DRAFT")}
            </Button>
            <Button disabled={pending} onClick={() => void publish()} size="sm">
              {pending ? t("PUBLISHING") : t("PUBLISH")}
            </Button>
          </div>
        ) : null}
      </div>
      {error ? <MutationError message={error} /> : null}
    </div>
  );
}

function CreatePlanDialog(
  props: Readonly<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCompleted: () => void;
  }>,
) {
  const { t } = useTranslation("commerce");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createAttempt = useRef<IdempotencyAttempt | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim()) return setError(t("PLAN_CODE_REQUIRED"));
    const planCode = code.trim();
    const fingerprint = JSON.stringify([planCode]);
    const attempt = idempotencyAttemptFor(createAttempt.current, fingerprint);
    createAttempt.current = attempt;
    setPending(true);
    setError(null);
    try {
      await createCommercePlan({ code: planCode }, attempt.key);
      if (createAttempt.current === attempt) createAttempt.current = null;
      props.onCompleted();
      props.onOpenChange(false);
      setCode("");
    } catch {
      setError(t("ACTION_ERROR"));
    } finally {
      setPending(false);
    }
  };
  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("CREATE_PLAN")}
      description={t("CREATE_PLAN_DESCRIPTION")}
      footer={
        <>
          <Button disabled={pending} onClick={() => props.onOpenChange(false)} variant="outline">
            {t("CANCEL")}
          </Button>
          <Button disabled={pending || !code.trim()} form="create-commerce-plan" type="submit">
            {pending ? t("SAVING") : t("CREATE_PLAN")}
          </Button>
        </>
      }
    >
      <form id="create-commerce-plan" onSubmit={submit}>
        <SettingDialogFields>
          {error ? <MutationError message={error} /> : null}
          <SettingDialogField title={<label htmlFor="plan-code">{t("PLAN_CODE")}</label>}>
            <Input
              autoComplete="off"
              id="plan-code"
              onChange={(event) => setCode(event.target.value)}
              value={code}
            />
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

function CreateDraftDialog(
  props: Readonly<{
    planCode: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCompleted: () => void;
  }>,
) {
  const { t } = useTranslation("commerce");
  const [terms, setTerms] = useState(DEFAULT_TERMS);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createAttempt = useRef<IdempotencyAttempt | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!props.planCode) return;
    let parsed: PlanRevisionTermsInput;
    try {
      parsed = JSON.parse(terms) as PlanRevisionTermsInput;
    } catch {
      setError(t("TERMS_JSON_INVALID"));
      return;
    }
    const fingerprint = JSON.stringify([props.planCode, parsed]);
    const attempt = idempotencyAttemptFor(createAttempt.current, fingerprint);
    createAttempt.current = attempt;
    setPending(true);
    setError(null);
    try {
      await createPlanRevision(props.planCode, { terms: parsed }, attempt.key);
      if (createAttempt.current === attempt) createAttempt.current = null;
      props.onCompleted();
      props.onOpenChange(false);
    } catch {
      setError(t("ACTION_ERROR"));
    } finally {
      setPending(false);
    }
  };
  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      title={t("CREATE_DRAFT")}
      description={t("CREATE_DRAFT_DESCRIPTION", { plan: props.planCode ?? "" })}
      footer={
        <>
          <Button disabled={pending} onClick={() => props.onOpenChange(false)} variant="outline">
            {t("CANCEL")}
          </Button>
          <Button disabled={pending} form="create-plan-draft" type="submit">
            {pending ? t("SAVING") : t("CREATE_DRAFT")}
          </Button>
        </>
      }
    >
      <form id="create-plan-draft" onSubmit={submit}>
        <SettingDialogFields>
          {error ? <MutationError message={error} /> : null}
          <SettingDialogField
            description={t("TERMS_JSON_DESCRIPTION")}
            title={<label htmlFor="plan-terms">{t("PLAN_TERMS")}</label>}
          >
            <Textarea
              id="plan-terms"
              onChange={(event) => setTerms(event.target.value)}
              rows={14}
              value={terms}
            />
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

function MutationError(props: Readonly<{ message: string }>) {
  const { t } = useTranslation("commerce");
  return (
    <Alert variant="destructive">
      <AlertTitle>{t("ACTION_FAILED")}</AlertTitle>
      <AlertDescription>{props.message}</AlertDescription>
    </Alert>
  );
}

function UpdateDraftDialog(
  props: Readonly<{
    draft: { planCode: string; revisionId: string; expectedRevision: number } | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCompleted: () => void;
  }>,
) {
  const { t } = useTranslation("commerce");
  const [terms, setTerms] = useState(DEFAULT_TERMS);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attemptRef = useRef<IdempotencyAttempt | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!props.draft) return;
    let parsed: PlanRevisionTermsInput;
    try {
      parsed = JSON.parse(terms) as PlanRevisionTermsInput;
    } catch {
      setError(t("TERMS_JSON_INVALID"));
      return;
    }
    const fingerprint = JSON.stringify([props.draft, parsed]);
    const attempt = idempotencyAttemptFor(attemptRef.current, fingerprint);
    attemptRef.current = attempt;
    setPending(true);
    setError(null);
    try {
      await updatePlanRevision(
        props.draft.planCode,
        props.draft.revisionId,
        { expectedRevision: props.draft.expectedRevision, terms: parsed },
        attempt.key,
      );
      attemptRef.current = null;
      props.onCompleted();
      props.onOpenChange(false);
    } catch {
      setError(t("ACTION_ERROR"));
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      title={t("EDIT_DRAFT")}
      description={t("EDIT_DRAFT_DESCRIPTION", { plan: props.draft?.planCode ?? "" })}
      footer={
        <>
          <Button disabled={pending} onClick={() => props.onOpenChange(false)} variant="outline">
            {t("CANCEL")}
          </Button>
          <Button disabled={pending} form="update-plan-draft" type="submit">
            {pending ? t("SAVING") : t("SAVE")}
          </Button>
        </>
      }
    >
      <form id="update-plan-draft" onSubmit={submit}>
        <SettingDialogFields>
          {error ? <MutationError message={error} /> : null}
          <SettingDialogField
            description={t("TERMS_JSON_DESCRIPTION")}
            title={<label htmlFor="update-plan-terms">{t("PLAN_TERMS")}</label>}
          >
            <Textarea
              id="update-plan-terms"
              onChange={(event) => setTerms(event.target.value)}
              rows={14}
              value={terms}
            />
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}
