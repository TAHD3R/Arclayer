import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { Controller, useForm } from "react-hook-form";
import { useRef, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";

import {
  submitFeedback,
  type FeedbackCategory,
  type FeedbackContextType,
  type FeedbackSource,
} from "@/api/feedback";
import { getErrorMessage, notifySuccessText } from "@/lib/notifications";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { Button } from "@arclayer/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@arclayer/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@arclayer/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@arclayer/ui/select";
import { Textarea } from "@arclayer/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@arclayer/ui/toggle-group";

const FEEDBACK_CATEGORIES: readonly FeedbackCategory[] = [
  "bug",
  "feature_request",
  "usability",
  "performance",
  "billing",
  "other",
];

const CATEGORY_KEYS: Record<FeedbackCategory, string> = {
  bug: "platform:CATEGORY_BUG",
  feature_request: "platform:CATEGORY_FEATURE_REQUEST",
  usability: "platform:CATEGORY_USABILITY",
  performance: "platform:CATEGORY_PERFORMANCE",
  billing: "platform:CATEGORY_BILLING",
  other: "platform:CATEGORY_OTHER",
};

type FeedbackFormValues = {
  category: FeedbackCategory;
  message: string;
  rating: string;
};

type FeedbackDialogProps = {
  source: FeedbackSource;
  trigger: ReactElement;
  conversationId?: string | null;
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

export function FeedbackDialog({ source, trigger, conversationId }: FeedbackDialogProps) {
  const { t } = useTranslation(["platform", "common"]);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const clientRequestIdRef = useRef<string | null>(null);
  const workspaceId = useWorkspaceStore(
    (state) => state.currentWorkspaceId ?? state.lastWorkspaceId,
  );
  const projectId = useWorkspaceStore((state) => state.currentProjectId ?? state.lastProjectId);
  const contextUrl = useRouterState({
    select: (state) => `${state.location.pathname}${state.location.searchStr}`,
  });
  const form = useForm<FeedbackFormValues>({
    defaultValues: { category: "usability", message: "", rating: "" },
  });

  const mutation = useMutation({
    mutationFn: submitFeedback,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["system", "feedback", "list"] });
      notifySuccessText(t("platform:FEEDBACK_DIALOG_SUCCESS"));
      clientRequestIdRef.current = null;
      form.reset();
      setOpen(false);
    },
  });

  const submit = form.handleSubmit((values) => {
    const contextType = resolveContextType({ conversationId, projectId, workspaceId });
    clientRequestIdRef.current ??= crypto.randomUUID();
    mutation.mutate({
      clientRequestId: clientRequestIdRef.current,
      source,
      contextType,
      ...(workspaceId ? { workspaceId } : {}),
      ...(projectId ? { projectId } : {}),
      category: values.category,
      message: values.message.trim(),
      ...(values.rating ? { rating: Number(values.rating) } : {}),
      contextUrl,
      context: {
        ...(conversationId ? { conversationId } : {}),
        route: contextUrl,
      },
    });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) mutation.reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-xl" closeButtonLabel={t("common:CLOSE")}>
        <DialogHeader>
          <DialogTitle>{t("platform:FEEDBACK_DIALOG_TITLE")}</DialogTitle>
          <DialogDescription>{t("platform:FEEDBACK_DIALOG_DESCRIPTION")}</DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-6" onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <Controller
              control={form.control}
              name="category"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="feedback-category">
                    {t("platform:FEEDBACK_DIALOG_CATEGORY_LABEL")}
                  </FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="feedback-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {FEEDBACK_CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>
                            {t(CATEGORY_KEYS[category])}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    {t("platform:FEEDBACK_DIALOG_CATEGORY_DESCRIPTION")}
                  </FieldDescription>
                </Field>
              )}
            />

            <Field data-invalid={Boolean(form.formState.errors.message)}>
              <FieldLabel htmlFor="feedback-message">
                {t("platform:FEEDBACK_DIALOG_MESSAGE_LABEL")}
              </FieldLabel>
              <Textarea
                id="feedback-message"
                rows={6}
                aria-invalid={Boolean(form.formState.errors.message)}
                placeholder={t("platform:FEEDBACK_DIALOG_MESSAGE_PLACEHOLDER")}
                {...form.register("message", {
                  required: t("platform:FEEDBACK_VALIDATION_REQUIRED"),
                  minLength: {
                    value: 10,
                    message: t("platform:FEEDBACK_VALIDATION_MIN_LENGTH", { count: 10 }),
                  },
                  maxLength: {
                    value: 4000,
                    message: t("platform:FEEDBACK_VALIDATION_MAX_LENGTH", { count: 4000 }),
                  },
                })}
              />
              <FieldDescription>
                {t("platform:FEEDBACK_DIALOG_MESSAGE_DESCRIPTION")}
              </FieldDescription>
              <FieldError errors={[form.formState.errors.message]} />
            </Field>

            <Controller
              control={form.control}
              name="rating"
              render={({ field }) => (
                <Field>
                  <FieldLabel>{t("platform:FEEDBACK_DIALOG_RATING_LABEL")}</FieldLabel>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={field.value}
                    onValueChange={field.onChange}
                    aria-label={t("platform:FEEDBACK_DIALOG_RATING_LABEL")}
                  >
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <ToggleGroupItem
                        key={rating}
                        value={String(rating)}
                        aria-label={t(`platform:RATING_${rating}`)}
                      >
                        {rating}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <FieldDescription>
                    {t("platform:FEEDBACK_DIALOG_RATING_DESCRIPTION")}
                  </FieldDescription>
                </Field>
              )}
            />

            {mutation.error ? <FieldError>{getErrorMessage(mutation.error)}</FieldError> : null}
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("common:CANCEL")}
            </Button>
            <Button type="submit" loading={mutation.isPending} disabled={mutation.isPending}>
              {t("platform:ACTION_SUBMIT_FEEDBACK")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
