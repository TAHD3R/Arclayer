export function resolveRefState(
  refState: "draft" | "published" | "auto",
  mode: "public" | "preview",
): "draft" | "published" {
  if (refState === "auto") {
    return mode === "preview" ? "draft" : "published";
  }
  // Key alignment rule:
  // - backend stores STATE_FORBIDDEN under `${entryId}:published`
  // - frontend must look up the same key even if refState was "draft"
  if (refState === "draft" && mode === "public") {
    return "published";
  }
  return refState;
}
