"use client";

import { defineToolkit, type ToolCallMessagePartProps } from "@assistant-ui/react";
import { useTranslation } from "react-i18next";

import { DesignGenerateTool } from "@/components/ai/design-generate-tool";
import { StyleGuideGenerateTool } from "@/components/ai/style-guide-generate-tool";
import { WireframeGenerateTool } from "@/components/ai/wireframe-generate-tool";

type HumanRequestInputArgs = {
  readonly question: string;
  readonly responseType: "text" | "single_select";
  readonly options: readonly string[];
};

function normalizeHumanQuestion(value: string): string {
  return value
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t");
}

function readHumanRequestInput(args: Record<string, unknown>): HumanRequestInputArgs | null {
  const question =
    typeof args.question === "string" ? normalizeHumanQuestion(args.question).trim() : "";
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
  const request = readHumanRequestInput(props.args);

  if (props.status.type === "running") {
    return null;
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

  return (
    <p className="py-1 whitespace-pre-wrap text-callout leading-relaxed text-label-primary">
      {request.question}
    </p>
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
