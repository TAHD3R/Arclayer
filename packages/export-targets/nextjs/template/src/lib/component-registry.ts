import { createElement, type ReactNode } from "react";

type Artifact = {
  kind: "json" | "html";
  payload?: Record<string, unknown>;
  html?: string;
};

function renderHtml(html: string): ReactNode {
  return createElement("div", { dangerouslySetInnerHTML: { __html: html } });
}

export function renderComponentTree(artifact: Artifact): ReactNode {
  if (artifact.kind === "html" && artifact.html) {
    return renderHtml(artifact.html);
  }
  return createElement("pre", null, JSON.stringify(artifact.payload ?? {}, null, 2));
}
