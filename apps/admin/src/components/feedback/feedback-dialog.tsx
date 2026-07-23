import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { CircleHelp, Heart, Lightbulb, MessageCircleMore, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactElement } from "react";
import { useTranslation } from "react-i18next";

import {
  submitFeedback,
  type FeedbackContextType,
  type FeedbackIntent,
  type FeedbackSource,
} from "@/api/feedback";
import { getErrorMessage, notifySuccessText } from "@/lib/notifications";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import { FieldError } from "@arclayer/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";
import { Textarea } from "@arclayer/ui/textarea";

const FEEDBACK_MIN_LENGTH = 10;
const FEEDBACK_MAX_LENGTH = 4000;

const FEEDBACK_INTENTS = [
  { value: "problem", labelKey: "FEEDBACK_INTENT_PROBLEM", icon: TriangleAlert },
  { value: "idea", labelKey: "FEEDBACK_INTENT_IDEA", icon: Lightbulb },
  { value: "question", labelKey: "FEEDBACK_INTENT_QUESTION", icon: CircleHelp },
  { value: "praise", labelKey: "FEEDBACK_INTENT_PRAISE", icon: Heart },
] as const satisfies readonly {
  value: FeedbackIntent;
  labelKey: string;
  icon: typeof TriangleAlert;
}[];

export type FeedbackReportContext = {
  requestId?: string;
  status?: number;
  errorCode?: string;
};

type FeedbackSubmissionOptions = {
  source: FeedbackSource;
  intent: FeedbackIntent;
  reportContext?: FeedbackReportContext;
  hiddenContext?: Readonly<Record<string, string | number | boolean | null>>;
  onSuccess: () => void;
};

export type FeedbackComposerProps = {
  source: FeedbackSource;
  initialIntent?: FeedbackIntent;
  lockIntent?: boolean;
  reportContext?: FeedbackReportContext;
  hiddenContext?: Readonly<Record<string, string | number | boolean | null>>;
  variant?: "popover" | "card";
  autoFocus?: boolean;
  active?: boolean;
  className?: string;
  onCancel?: () => void;
  onSuccess?: () => void;
};

function resolveContextType(input: {
  projectId: string | null;
  workspaceId: string | null;
}): FeedbackContextType {
  if (input.projectId) return "project";
  if (input.workspaceId) return "workspace";
  return "global";
}

function useFeedbackSubmission(options: FeedbackSubmissionOptions) {
  const { t } = useTranslation(["platform"]);
  const queryClient = useQueryClient();
  const clientRequestIdRef = useRef<string | null>(null);
  const workspaceId = useWorkspaceStore(
    (state) => state.currentWorkspaceId ?? state.lastWorkspaceId,
  );
  const projectId = useWorkspaceStore((state) => state.currentProjectId ?? state.lastProjectId);
  const contextUrl = useRouterState({
    select: (state) => `${state.location.pathname}${state.location.searchStr}`,
  });
  return useMutation({
    mutationFn: (message: string) => {
      clientRequestIdRef.current ??= crypto.randomUUID();
      return submitFeedback({
        clientRequestId: clientRequestIdRef.current,
        source: options.source,
        contextType: resolveContextType({ projectId, workspaceId }),
        ...(workspaceId ? { workspaceId } : {}),
        ...(projectId ? { projectId } : {}),
        intent: options.intent,
        message,
        contextUrl,
        context: {
          route: contextUrl,
          ...options.hiddenContext,
          ...(options.reportContext?.requestId
            ? { requestId: options.reportContext.requestId }
            : {}),
          ...(options.reportContext?.status ? { httpStatus: options.reportContext.status } : {}),
          ...(options.reportContext?.errorCode
            ? { errorCode: options.reportContext.errorCode }
            : {}),
        },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dataTable", "system-feedback-center"] });
      notifySuccessText(t("platform:FEEDBACK_DIALOG_SUCCESS"));
      clientRequestIdRef.current = null;
      options.onSuccess();
    },
  });
}

function validateFeedback(message: string, t: (key: string, values?: { count: number }) => string) {
  if (!message) return t("platform:FEEDBACK_VALIDATION_REQUIRED");
  if (message.length < FEEDBACK_MIN_LENGTH) {
    return t("platform:FEEDBACK_VALIDATION_MIN_LENGTH", { count: FEEDBACK_MIN_LENGTH });
  }
  if (message.length > FEEDBACK_MAX_LENGTH) {
    return t("platform:FEEDBACK_VALIDATION_MAX_LENGTH", { count: FEEDBACK_MAX_LENGTH });
  }
  return null;
}

export function FeedbackComposer(props: FeedbackComposerProps) {
  const { t } = useTranslation(["platform", "common"]);
  const isHeaderPopover = props.variant === "popover";
  const defaultIntent = props.initialIntent ?? (isHeaderPopover ? "problem" : null);
  const sectionPaddingClassName = isHeaderPopover ? "px-3" : "px-4";
  const [intent, setIntent] = useState<FeedbackIntent | null>(defaultIntent);
  const [message, setMessage] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const mutation = useFeedbackSubmission({
    source: props.source,
    intent: intent ?? "problem",
    reportContext: props.reportContext,
    hiddenContext: props.hiddenContext,
    onSuccess: () => {
      setMessage("");
      setValidationError(null);
      props.onSuccess?.();
    },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!intent) return;
    const normalizedMessage = message.trim();
    const nextError = validateFeedback(normalizedMessage, t);
    setValidationError(nextError);
    if (nextError) return;
    mutation.mutate(normalizedMessage);
  };
  const remaining = FEEDBACK_MAX_LENGTH - message.length;

  useEffect(() => {
    if (!props.active) return;
    const selector = defaultIntent ? "textarea" : '[role="radio"]';
    formRef.current?.querySelector<HTMLElement>(selector)?.focus();
  }, [defaultIntent, props.active]);

  return (
    <form
      ref={formRef}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden bg-popover text-popover-foreground",
        props.variant === "card" && "rounded-xl border border-border shadow-sm",
        props.className,
      )}
      onSubmit={submit}
    >
      <div
        className={cn(
          "flex items-start pb-3",
          sectionPaddingClassName,
          isHeaderPopover ? "pt-3" : "gap-3 pt-4",
        )}
      >
        {!isHeaderPopover ? (
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-label-primary">
            <MessageCircleMore className="size-4" aria-hidden="true" />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 className="text-callout font-semibold text-label-primary">
            {t("platform:FEEDBACK_COMPOSER_TITLE")}
          </h2>
          <p className="mt-0.5 text-footnote leading-snug text-label-secondary">
            {t("platform:FEEDBACK_COMPOSER_DESCRIPTION")}
          </p>
        </div>
        {props.onCancel && !isHeaderPopover ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={mutation.isPending}
            aria-label={t("common:CLOSE")}
            onClick={props.onCancel}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      {!props.lockIntent ? (
        <div
          role="radiogroup"
          aria-label={t("platform:FEEDBACK_DIALOG_INTENT_LABEL")}
          className={cn(
            "grid grid-cols-2 gap-1.5 pb-3",
            sectionPaddingClassName,
            !isHeaderPopover && "sm:grid-cols-4",
          )}
        >
          {FEEDBACK_INTENTS.map((option, index) => {
            const Icon = option.icon;
            const selected = intent === option.value;
            return (
              <Button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                variant={selected ? "secondary" : "ghost"}
                size="sm"
                autoFocus={props.autoFocus !== false && !defaultIntent && index === 0}
                className={cn(
                  "h-8 justify-center gap-1.5 px-2 text-footnote font-medium",
                  selected && "bg-accent text-label-primary",
                )}
                onClick={() => {
                  setIntent(option.value);
                  if (mutation.error) mutation.reset();
                }}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {t(`platform:${option.labelKey}`)}
              </Button>
            );
          })}
        </div>
      ) : null}

      <div className={sectionPaddingClassName}>
        <div
          className={cn(
            "overflow-hidden rounded-lg border bg-background transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20",
            validationError && "border-destructive",
          )}
        >
          <Textarea
            value={message}
            rows={4}
            autoFocus={props.autoFocus !== false && Boolean(defaultIntent)}
            aria-label={t("platform:FEEDBACK_DIALOG_MESSAGE_LABEL")}
            aria-invalid={Boolean(validationError)}
            placeholder={t("platform:FEEDBACK_DIALOG_MESSAGE_PLACEHOLDER")}
            onChange={(event) => {
              setMessage(event.target.value);
              if (validationError) setValidationError(null);
              if (mutation.error) mutation.reset();
            }}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.currentTarget.form?.requestSubmit();
              }
            }}
            className="min-h-24 resize-none rounded-none border-0 bg-transparent px-3 py-2.5 text-callout shadow-none focus-visible:ring-0 md:text-callout"
          />
          <div className="flex items-center justify-between border-t border-border/70 px-3 py-1.5 text-caption text-label-tertiary">
            <span>{t("platform:FEEDBACK_COMPOSER_SHORTCUT")}</span>
            <span className={cn("tabular-nums", remaining < 0 && "text-destructive")}>
              {remaining}
            </span>
          </div>
        </div>
        {validationError ? <FieldError className="mt-2">{validationError}</FieldError> : null}
        {mutation.error ? (
          <FieldError className="mt-2">{getErrorMessage(mutation.error)}</FieldError>
        ) : null}
      </div>

      <div className={cn("flex items-center justify-end gap-2 py-3", sectionPaddingClassName)}>
        {props.onCancel ? (
          <Button
            type="button"
            variant="ghost"
            disabled={mutation.isPending}
            onClick={props.onCancel}
          >
            {t("common:CANCEL")}
          </Button>
        ) : null}
        <Button
          type="submit"
          loading={mutation.isPending}
          disabled={mutation.isPending || !intent || message.trim().length === 0}
        >
          {t("platform:ACTION_SUBMIT_FEEDBACK")}
        </Button>
      </div>
    </form>
  );
}

export function HeaderFeedbackPopover(props: {
  trigger: ReactElement;
  source?: FeedbackSource;
  initialIntent?: FeedbackIntent;
  lockIntent?: boolean;
  reportContext?: FeedbackReportContext;
}) {
  const [open, setOpen] = useState(false);
  const initialIntent = props.initialIntent ?? (props.reportContext ? "problem" : undefined);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{props.trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="max-h-[min(34rem,calc(100vh-2rem))] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto p-0"
      >
        <FeedbackComposer
          source={props.source ?? "header"}
          initialIntent={initialIntent}
          lockIntent={props.lockIntent}
          reportContext={props.reportContext}
          variant="popover"
          onCancel={() => setOpen(false)}
          onSuccess={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
