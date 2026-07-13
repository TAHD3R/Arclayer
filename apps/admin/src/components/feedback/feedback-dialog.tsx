import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { ShieldCheckIcon, XIcon } from "lucide-react";
import { useRef, useState, type FormEvent, type ReactElement } from "react";
import { useTranslation } from "react-i18next";

import { submitFeedback, type FeedbackContextType, type FeedbackSource } from "@/api/feedback";
import { getErrorMessage, notifySuccessText } from "@/lib/notifications";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { Button } from "@arclayer/ui/button";
import { FieldError } from "@arclayer/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";
import { Textarea } from "@arclayer/ui/textarea";

const FEEDBACK_MIN_LENGTH = 10;
const FEEDBACK_MAX_LENGTH = 4000;

type FeedbackSubmissionOptions = {
  source: FeedbackSource;
  conversationId?: string | null;
  onSuccess: () => void;
};

function resolveContextType(input: {
  conversationId?: string | null;
  projectId: string | null;
  workspaceId: string | null;
}): FeedbackContextType {
  if (input.conversationId) return "ai_conversation";
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
  const mutation = useMutation({
    mutationFn: (message: string) => {
      clientRequestIdRef.current ??= crypto.randomUUID();
      return submitFeedback({
        clientRequestId: clientRequestIdRef.current,
        source: options.source,
        contextType: resolveContextType({
          conversationId: options.conversationId,
          projectId,
          workspaceId,
        }),
        ...(workspaceId ? { workspaceId } : {}),
        ...(projectId ? { projectId } : {}),
        category: "usability",
        message,
        contextUrl,
        context: {
          ...(options.conversationId ? { conversationId: options.conversationId } : {}),
          route: contextUrl,
        },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["system", "feedback", "list"] });
      notifySuccessText(t("platform:FEEDBACK_DIALOG_SUCCESS"));
      clientRequestIdRef.current = null;
      options.onSuccess();
    },
  });

  return mutation;
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

type FeedbackComposerProps = FeedbackSubmissionOptions & {
  onCancel?: () => void;
  variant: "header" | "ai";
};

function FeedbackComposer({ onCancel, variant, ...submissionOptions }: FeedbackComposerProps) {
  const { t } = useTranslation(["platform", "common"]);
  const [message, setMessage] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const mutation = useFeedbackSubmission({
    ...submissionOptions,
    onSuccess: () => {
      setMessage("");
      setValidationError(null);
      submissionOptions.onSuccess();
    },
  });
  const isAI = variant === "ai";
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedMessage = message.trim();
    const nextError = validateFeedback(normalizedMessage, t);
    setValidationError(nextError);
    if (nextError) return;
    mutation.mutate(normalizedMessage);
  };

  return (
    <form className="flex min-w-0 flex-col" onSubmit={submit}>
      {isAI ? (
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2 text-footnote font-semibold text-primary">
            <ShieldCheckIcon aria-hidden="true" />
            <span className="truncate">{t("platform:FEEDBACK_AI_TITLE")}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("common:CLOSE")}
            onClick={onCancel}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      <div className={isAI ? "p-4 pb-2" : "p-4 pb-3"}>
        <Textarea
          value={message}
          rows={isAI ? 4 : 5}
          autoFocus
          aria-label={t("platform:FEEDBACK_DIALOG_MESSAGE_LABEL")}
          aria-invalid={Boolean(validationError)}
          placeholder={t(
            isAI ? "platform:FEEDBACK_AI_PLACEHOLDER" : "platform:FEEDBACK_HEADER_PLACEHOLDER",
          )}
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
          className="min-h-28 resize-none bg-background text-callout md:text-callout"
        />
        {validationError ? <FieldError className="mt-2">{validationError}</FieldError> : null}
        {mutation.error ? (
          <FieldError className="mt-2">{getErrorMessage(mutation.error)}</FieldError>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 px-4 pb-4">
        <p className="min-w-0 text-footnote leading-snug text-label-secondary">
          {t(
            isAI ? "platform:FEEDBACK_AI_CONTEXT_ATTACHED" : "platform:FEEDBACK_HEADER_DESCRIPTION",
          )}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {isAI ? (
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t("common:CANCEL")}
            </Button>
          ) : null}
          <Button type="submit" loading={mutation.isPending} disabled={mutation.isPending}>
            {t(isAI ? "platform:FEEDBACK_AI_SEND" : "platform:ACTION_SUBMIT_FEEDBACK")}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function HeaderFeedbackPopover(props: { trigger: ReactElement }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{props.trigger}</PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(30rem,calc(100vw-2rem))] p-0">
        <FeedbackComposer source="header" variant="header" onSuccess={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

export function AIConversationFeedbackPanel(props: {
  conversationId?: string | null;
  onCancel: () => void;
  onSubmitted: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-popover shadow-sm">
      <FeedbackComposer
        source="ai_sidebar"
        variant="ai"
        conversationId={props.conversationId}
        onCancel={props.onCancel}
        onSuccess={props.onSubmitted}
      />
    </section>
  );
}
