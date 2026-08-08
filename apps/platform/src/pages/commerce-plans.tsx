import { useCallback, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
  PlanRevisionTermsInput,
  PlatformCommercePlanCatalogOut,
} from "@arclayer/platform-openapi";

import {
  createCommercePlan,
  createPlanRevision,
  deactivateCommercePlan,
  listCommercePlans,
  publishPlanRevision,
  updatePlanRevision,
} from "@/commerce/commerce-api";
import { CommercePage, CommerceQueryState } from "@/commerce/commerce-ui";
import { CommerceTableToolbar, type CommerceColumn } from "@/components/commerce-data-table";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingDialog } from "@/components/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@/components/setting-dialog-field";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

const PLAN_COLUMNS: readonly CommerceColumn[] = [
  { id: "code", label: "Plan" },
  { id: "state", label: "Selling state" },
  { id: "revision", label: "Latest version" },
  { id: "actions", label: "Actions" },
];

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
  const [deactivatePlanCode, setDeactivatePlanCode] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    planCode: string;
    revisionId: string;
    expectedRevision: number;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [visibleColumns, setVisibleColumns] = useState(PLAN_COLUMNS.map((column) => column.id));
  const load = useCallback(() => listCommercePlans({ includeInactive: true }), []);
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <CommercePage
      description={t("PLANS_DESCRIPTION")}
      primaryAction={<Button onClick={() => setCreateOpen(true)}>{t("CREATE_PLAN")}</Button>}
      secondaryActions={
        <Button disabled={state.status === "loading"} onClick={retry} variant="outline">
          {t("REFRESH")}
        </Button>
      }
      title={t("PLANS_TITLE")}
    >
      <CommerceQueryState isEmpty={(data) => data.items.length === 0} retry={retry} state={state}>
        {(data) => {
          const filtered = search.trim().toLowerCase()
            ? {
                ...data,
                items: data.items.filter((plan) =>
                  plan.code.toLowerCase().includes(search.trim().toLowerCase()),
                ),
              }
            : data;
          const sorted = {
            ...filtered,
            items: [...filtered.items].sort((left, right) => {
              const leftSequence = left.revisions.at(-1)?.sequence ?? 0;
              const rightSequence = right.revisions.at(-1)?.sequence ?? 0;
              const comparison = leftSequence - rightSequence;
              return sortDirection === "asc" ? comparison : -comparison;
            }),
          };
          return (
            <div className="space-y-4">
              <CommerceTableToolbar
                columns={PLAN_COLUMNS}
                columnsLabel={t("CHOOSE_COLUMNS")}
                filters={
                  <Select
                    onValueChange={(value) => setSortDirection(value as "asc" | "desc")}
                    value={sortDirection}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder={t("SORT_ORDER_PLACEHOLDER")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desc">{t("SORT_NEWEST")}</SelectItem>
                      <SelectItem value="asc">{t("SORT_OLDEST")}</SelectItem>
                    </SelectContent>
                  </Select>
                }
                onRefresh={retry}
                onSearchChange={setSearch}
                onVisibleColumnsChange={(ids) => setVisibleColumns([...ids])}
                refreshLabel={t("REFRESH")}
                searchPlaceholder={t("PLANS_SEARCH")}
                searchValue={search}
                visibleColumns={visibleColumns}
              />
              <PlanTable
                data={sorted}
                onCreateDraft={setDraftPlanCode}
                onDeactivate={setDeactivatePlanCode}
                onEditDraft={setEditDraft}
                onPublished={retry}
                visibleColumns={visibleColumns}
              />
            </div>
          );
        }}
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
      <DeactivatePlanDialog
        onCompleted={retry}
        onOpenChange={(open) => !open && setDeactivatePlanCode(null)}
        open={deactivatePlanCode !== null}
        planCode={deactivatePlanCode}
      />
    </CommercePage>
  );
}

function PlanTable(
  props: Readonly<{
    data: PlatformCommercePlanCatalogOut;
    onCreateDraft: (code: string) => void;
    onDeactivate: (code: string) => void;
    onEditDraft: (draft: {
      planCode: string;
      revisionId: string;
      expectedRevision: number;
    }) => void;
    onPublished: () => void;
    visibleColumns: readonly string[];
  }>,
) {
  const { t } = useTranslation("commerce");
  const shown = (id: string) => props.visibleColumns.includes(id);
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            {shown("code") ? <TableHead>{t("PLAN")}</TableHead> : null}
            {shown("state") ? <TableHead>{t("STATUS")}</TableHead> : null}
            {shown("revision") ? <TableHead>{t("REVISION")}</TableHead> : null}
            {shown("actions") ? <TableHead>{t("ACTION")}</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.data.items.map((plan) => {
            const latest = plan.revisions[plan.revisions.length - 1];
            return (
              <TableRow key={plan.id}>
                {shown("code") ? (
                  <TableCell>
                    <div className="font-medium">{plan.code}</div>
                    <div className="font-mono text-xs text-muted-foreground">{plan.id}</div>
                  </TableCell>
                ) : null}
                {shown("state") ? (
                  <TableCell>
                    <Badge variant={plan.isActive ? "secondary" : "outline"}>
                      {plan.isActive ? t("ACTIVE") : t("INACTIVE")}
                    </Badge>
                  </TableCell>
                ) : null}
                {shown("revision") ? (
                  <TableCell>
                    {latest ? (
                      <div>
                        <div>{t("SEQUENCE", { sequence: latest.sequence })}</div>
                        <div className="text-sm text-muted-foreground">
                          {t(`REVISION_STATUS_${latest.status.toUpperCase()}`)}
                        </div>
                      </div>
                    ) : (
                      t("NO_REVISIONS")
                    )}
                  </TableCell>
                ) : null}
                {shown("actions") ? (
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => props.onCreateDraft(plan.code)}
                        size="sm"
                        variant="outline"
                      >
                        {t("CREATE_DRAFT")}
                      </Button>
                      {plan.isActive ? (
                        <Button
                          onClick={() => props.onDeactivate(plan.code)}
                          size="sm"
                          variant="destructive"
                        >
                          {t("DEACTIVATE_PLAN")}
                        </Button>
                      ) : null}
                      {plan.revisions
                        .filter((revision) => revision.status === "draft")
                        .map((revision) => (
                          <PlanRevisionRow
                            key={revision.id}
                            compact
                            onEditDraft={props.onEditDraft}
                            onPublished={props.onPublished}
                            planCode={plan.code}
                            revision={revision}
                          />
                        ))}
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
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
    compact?: boolean;
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
    <div className={props.compact ? "flex gap-2" : "space-y-2 border-t pt-3"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={props.compact ? "sr-only" : undefined}>
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

function DeactivatePlanDialog(
  props: Readonly<{
    planCode: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCompleted: () => void;
  }>,
) {
  const { t } = useTranslation("commerce");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attemptRef = useRef<IdempotencyAttempt | null>(null);

  const deactivate = async () => {
    if (!props.planCode) return;
    const fingerprint = JSON.stringify([props.planCode]);
    const attempt = idempotencyAttemptFor(attemptRef.current, fingerprint);
    attemptRef.current = attempt;
    setPending(true);
    setError(null);
    try {
      await deactivateCommercePlan(props.planCode, attempt.key);
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
      description={t("DEACTIVATE_PLAN_DESCRIPTION", { plan: props.planCode ?? "" })}
      footer={
        <>
          <Button disabled={pending} onClick={() => props.onOpenChange(false)} variant="outline">
            {t("CANCEL")}
          </Button>
          <Button disabled={pending} onClick={() => void deactivate()} variant="destructive">
            {pending ? t("SAVING") : t("DEACTIVATE_PLAN")}
          </Button>
        </>
      }
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      open={props.open}
      title={t("DEACTIVATE_PLAN")}
    >
      {error ? <MutationError message={error} /> : null}
    </SettingDialog>
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
              placeholder={t("PLAN_CODE_PLACEHOLDER")}
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
          <PlanTermsFields terms={terms} onTermsChange={setTerms} />
          <SettingDialogField
            description={t("TERMS_JSON_DESCRIPTION")}
            title={<label htmlFor="plan-terms">{t("PLAN_TERMS")}</label>}
          >
            <Textarea
              id="plan-terms"
              onChange={(event) => setTerms(event.target.value)}
              placeholder={t("TERMS_JSON_PLACEHOLDER")}
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
          <PlanTermsFields terms={terms} onTermsChange={setTerms} />
          <SettingDialogField
            description={t("TERMS_JSON_DESCRIPTION")}
            title={<label htmlFor="update-plan-terms">{t("PLAN_TERMS")}</label>}
          >
            <Textarea
              id="update-plan-terms"
              onChange={(event) => setTerms(event.target.value)}
              placeholder={t("TERMS_JSON_PLACEHOLDER")}
              rows={14}
              value={terms}
            />
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

function PlanTermsFields(
  props: Readonly<{ terms: string; onTermsChange: (value: string) => void }>,
) {
  const { t } = useTranslation("commerce");
  const parsed = parseTerms(props.terms);
  const update = (key: string, value: unknown) => {
    props.onTermsChange(JSON.stringify({ ...parsed, [key]: value }, null, 2));
  };
  const prices = Array.isArray(parsed.prices)
    ? parsed.prices.filter(
        (value): value is Record<string, unknown> => Boolean(value) && typeof value === "object",
      )
    : [];
  const rows = prices.length > 0 ? prices : [{}];
  const updatePrice = (index: number, key: string, value: unknown) => {
    const nextPrices = rows.map((row) => ({ ...row }));
    nextPrices[index] = { ...nextPrices[index], [key]: value };
    update("prices", nextPrices);
  };
  const addPrice = () => update("prices", [...rows, {}]);
  const removePrice = (index: number) =>
    update(
      "prices",
      rows.filter((_, rowIndex) => rowIndex !== index),
    );
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <SettingDialogField title={t("PLAN_NAME_KEY")}>
          <Input
            onChange={(event) => update("nameI18NKey", event.target.value)}
            placeholder={t("PLAN_NAME_KEY_PLACEHOLDER")}
            value={stringValue(parsed.nameI18NKey)}
          />
        </SettingDialogField>
        <SettingDialogField title={t("PLAN_DESCRIPTION_KEY")}>
          <Input
            onChange={(event) => update("descriptionI18NKey", event.target.value)}
            placeholder={t("PLAN_DESCRIPTION_KEY_PLACEHOLDER")}
            value={stringValue(parsed.descriptionI18NKey)}
          />
        </SettingDialogField>
        <SettingDialogField title={t("CREDIT_GRANT_AMOUNT")}>
          <Input
            inputMode="numeric"
            onChange={(event) => update("creditGrantAmount", numberValue(event.target.value))}
            placeholder={t("CREDIT_GRANT_AMOUNT_PLACEHOLDER")}
            value={stringValue(parsed.creditGrantAmount)}
          />
        </SettingDialogField>
        <SettingDialogField title={t("CREDIT_VALUE_MICROS")}>
          <Input
            inputMode="numeric"
            onChange={(event) => update("creditValueMicros", numberValue(event.target.value))}
            placeholder={t("CREDIT_VALUE_MICROS_PLACEHOLDER")}
            value={stringValue(parsed.creditValueMicros)}
          />
        </SettingDialogField>
        <SettingDialogField title={t("CREDIT_REFRESH_INTERVAL")}>
          <Select
            onValueChange={(value) => update("creditRefreshInterval", value)}
            value={stringValue(parsed.creditRefreshInterval) || "none"}
          >
            <SelectTrigger aria-label={t("CREDIT_REFRESH_INTERVAL")}>
              <SelectValue placeholder={t("CREDIT_REFRESH_INTERVAL_PLACEHOLDER")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("CREDIT_REFRESH_NONE")}</SelectItem>
              <SelectItem value="monthly">{t("CREDIT_REFRESH_MONTHLY")}</SelectItem>
              <SelectItem value="yearly">{t("CREDIT_REFRESH_YEARLY")}</SelectItem>
            </SelectContent>
          </Select>
        </SettingDialogField>
        <SettingDialogField title={t("CURRENCY")}>
          <Input
            onChange={(event) => update("currency", event.target.value.toUpperCase())}
            placeholder={t("CURRENCY_PLACEHOLDER")}
            value={stringValue(parsed.currency)}
          />
        </SettingDialogField>
      </div>
      <div className="space-y-3 rounded-md border p-3">
        <p className="text-sm font-medium">{t("CONNECTOR_PRICE_MAPPING")}</p>
        <div className="space-y-3">
          {rows.map((price, index) => (
            <div className="rounded-md border p-3" key={`${stringValue(price.provider)}-${index}`}>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium">
                  {t("CONNECTOR_PRICE_NUMBER", { number: index + 1 })}
                </p>
                <Button
                  aria-label={t("REMOVE_CONNECTOR_PRICE")}
                  disabled={rows.length === 1}
                  onClick={() => removePrice(index)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  onChange={(event) => updatePrice(index, "provider", event.target.value)}
                  placeholder={t("CONNECTOR_PROVIDER_PLACEHOLDER")}
                  value={stringValue(price.provider)}
                />
                <Select
                  onValueChange={(value) => updatePrice(index, "providerMode", value)}
                  value={stringValue(price.providerMode) || "test"}
                >
                  <SelectTrigger aria-label={t("PROVIDER_MODE")}>
                    <SelectValue placeholder={t("PROVIDER_MODE_PLACEHOLDER")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="test">{t("PROVIDER_MODE_TEST")}</SelectItem>
                    <SelectItem value="live">{t("PROVIDER_MODE_LIVE")}</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  onChange={(event) => updatePrice(index, "externalPriceId", event.target.value)}
                  placeholder={t("EXTERNAL_PRICE_ID_PLACEHOLDER")}
                  value={stringValue(price.externalPriceId)}
                />
                <Input
                  inputMode="numeric"
                  onChange={(event) =>
                    updatePrice(index, "amountMicros", numberValue(event.target.value))
                  }
                  placeholder={t("PRICE_AMOUNT_PLACEHOLDER")}
                  value={stringValue(price.amountMicros)}
                />
              </div>
            </div>
          ))}
          <Button onClick={addPrice} type="button" variant="outline">
            <Plus className="mr-2 size-4" />
            {t("ADD_CONNECTOR_PRICE")}
          </Button>
        </div>
      </div>
    </>
  );
}

function parseTerms(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function numberValue(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
