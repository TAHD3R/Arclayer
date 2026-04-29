import { createFileRoute } from "@tanstack/react-router";

type ProjectContentModelsEditSearch = {
  modelId?: string;
};

export const Route = createFileRoute("/projects/$projectId/content/models/edit/")({
  validateSearch: (search: Record<string, unknown>): ProjectContentModelsEditSearch => {
    const modelId =
      typeof search.modelId === "string" && search.modelId.trim()
        ? search.modelId.trim()
        : undefined;
    return modelId ? { modelId } : {};
  },
  staticData: { titleKey: "nav:NAV_CONTENT_MODELS" },
});
