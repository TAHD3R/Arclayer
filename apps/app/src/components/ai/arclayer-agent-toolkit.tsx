"use client";

import { defineToolkit, type ToolCallMessagePartProps } from "@assistant-ui/react";
import { LoaderIcon, MessageCircleQuestionIcon } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "@arclayer/ui/field";
import { Input } from "@arclayer/ui/input";
import { RadioGroup, RadioGroupItem } from "@arclayer/ui/radio-group";

import { DesignGenerateTool } from "@/components/ai/design-generate-tool";
import { StyleGuideGenerateTool } from "@/components/ai/style-guide-generate-tool";
import { WireframeGenerateTool } from "@/components/ai/wireframe-generate-tool";

type HumanRequestInputArgs = {
  readonly question: string;
  readonly responseType: "text" | "single_select";
  readonly options: readonly string[];
};

function readHumanRequestInput(args: Record<string, unknown>): HumanRequestInputArgs | null {
  const question = typeof args.question === "string" ? args.question.trim() : "";
  const responseType = args.responseType;
  const options = Array.isArray(args.options)
    ? args.options.filter((option): option is string => typeof option === "string")
    : [];
  if (!question || (responseType !== "text" && responseType !== "single_select")) return null;
  if (responseType === "single_select" && options.length === 0) return null;
  return { question, responseType, options };
}

function HumanRequestInputTool(props: ToolCallMessagePartProps) {
  const { t } = useTranslation(["ai"]);
  const inputId = useId();
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const request = readHumanRequestInput(props.args);

  if (props.status.type === "running") {
    return (
      <div
        className="flex items-center gap-2 py-2 text-footnote text-label-secondary"
        aria-live="polite"
      >
        <LoaderIcon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {t("ai:AI_CHAT_HUMAN_TOOL_PREPARING")}
      </div>
    );
  }

  if (request === null) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-footnote text-destructive"
      >
        {t("ai:AI_CHAT_HUMAN_TOOL_INVALID")}
      </div>
    );
  }

  if (props.status.type === "incomplete") {
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-footnote text-destructive"
      >
        {t("ai:AI_CHAT_HUMAN_TOOL_FAILED")}
      </div>
    );
  }

  if (props.status.type === "complete") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-card px-3 py-2.5">
        <MessageCircleQuestionIcon
          className="mt-0.5 size-4 shrink-0 text-label-secondary"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-footnote font-semibold text-label-primary">{request.question}</p>
          <p className="mt-0.5 text-caption text-label-secondary">
            {t("ai:AI_CHAT_HUMAN_TOOL_ANSWERED")}
          </p>
        </div>
      </div>
    );
  }

  const submitAnswer = () => {
    const normalized = answer.trim();
    if (!normalized) {
      setValidationError(t("ai:AI_CHAT_HUMAN_TOOL_ANSWER_REQUIRED"));
      return;
    }
    if (!props.resume) throw new Error("Human Tool resume callback is unavailable");
    props.resume({ answer: normalized });
    setSubmitted(true);
    setValidationError(null);
  };

  return (
    <form
      className="flex flex-col gap-4 rounded-xl border border-border/70 bg-card p-4 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        submitAnswer();
      }}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-label-primary">
          <MessageCircleQuestionIcon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-caption font-medium text-label-secondary">
            {t("ai:AI_CHAT_HUMAN_TOOL_LABEL")}
          </p>
          <p className="mt-0.5 text-callout font-semibold leading-snug text-label-primary">
            {request.question}
          </p>
        </div>
      </div>

      {request.responseType === "text" ? (
        <FieldGroup className="gap-3">
          <Field data-invalid={validationError ? true : undefined}>
            <FieldLabel htmlFor={inputId}>{t("ai:AI_CHAT_HUMAN_TOOL_YOUR_ANSWER")}</FieldLabel>
            <Input
              id={inputId}
              value={answer}
              autoFocus
              aria-invalid={validationError ? true : undefined}
              placeholder={t("ai:AI_CHAT_HUMAN_TOOL_ANSWER_PLACEHOLDER")}
              onChange={(event) => setAnswer(event.target.value)}
            />
            <FieldError>{validationError}</FieldError>
          </Field>
        </FieldGroup>
      ) : (
        <FieldSet>
          <FieldLegend className="sr-only">{request.question}</FieldLegend>
          <RadioGroup value={answer} onValueChange={setAnswer} className="gap-2">
            {request.options.map((option, index) => {
              const optionId = `${inputId}-${index}`;
              return (
                <FieldLabel
                  key={`${option}-${index}`}
                  htmlFor={optionId}
                  className="w-full cursor-pointer items-center rounded-lg border border-border/70 px-3 py-2.5 transition-colors hover:bg-accent"
                >
                  <RadioGroupItem id={optionId} value={option} />
                  <span className="text-footnote text-label-primary">{option}</span>
                </FieldLabel>
              );
            })}
          </RadioGroup>
          <FieldError>{validationError}</FieldError>
        </FieldSet>
      )}

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={submitted}>
          {submitted ? (
            <LoaderIcon
              data-icon="inline-start"
              className="animate-spin motion-reduce:animate-none"
            />
          ) : null}
          {submitted ? t("ai:AI_CHAT_HUMAN_TOOL_SUBMITTING") : t("ai:AI_CHAT_HUMAN_TOOL_SUBMIT")}
        </Button>
      </div>
    </form>
  );
}

export const arclayerAgentToolkit = defineToolkit({
  "human.request_input": {
    type: "backend",
    render: HumanRequestInputTool,
  },
  "builder.style_guide.generate": {
    type: "backend",
    render: StyleGuideGenerateTool,
  },
  "builder.wireframe.generate": {
    type: "backend",
    render: WireframeGenerateTool,
  },
  "builder.design.generate": {
    type: "backend",
    render: DesignGenerateTool,
  },
});

export const ARCLAYER_AGENT_TOOL_NAMES = new Set(Object.keys(arclayerAgentToolkit));
export { HumanRequestInputTool };
