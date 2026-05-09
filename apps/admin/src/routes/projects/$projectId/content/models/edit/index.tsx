import { createFileRoute } from "@tanstack/react-router";

type ProjectContentModelsEditSearch = {
  modelId?: string;
  section?: "fields" | "settings";
};

export const Route = createFileRoute("/projects/$projectId/content/models/edit/")({
  validateSearch: (search: Record<string, unknown>): ProjectContentModelsEditSearch => {
    const modelId =
      typeof search.modelId === "string" && search.modelId.trim()
        ? search.modelId.trim()
        : undefined;
    const section = search.section === "settings" ? "settings" : undefined;
    return { ...(modelId ? { modelId } : {}), ...(section ? { section } : {}) };
  },
  staticData: { titleKey: "nav:NAV_CONTENT_MODELS" },
});
