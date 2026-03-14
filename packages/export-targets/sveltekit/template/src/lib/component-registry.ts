type Artifact = {
  kind: "json" | "html";
  payload?: Record<string, unknown>;
  html?: string;
};

export function renderComponentTree(artifact: Artifact): string {
  if (artifact.kind === "html" && artifact.html) {
    return artifact.html;
  }
  return JSON.stringify(artifact.payload ?? {}, null, 2);
}
