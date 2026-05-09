import { createFileRoute } from "@tanstack/react-router";

type ProjectContentModelsEditSearch = {
  modelId?: string;
  create?: boolean;
  section?: "fields" | "name_description" | "json_preview" | "settings" | "workflow";
};

export const Route = createFileRoute("/projects/$projectId/content/models/edit/")({
  validateSearch: (search: Record<string, unknown>): ProjectContentModelsEditSearch => {
    const modelId =
      typeof search.modelId === "string" && search.modelId.trim()
        ? search.modelId.trim()
        : undefined;
    const create = search.create === true || search.create === "1" || search.create === "true";
    const section =
      search.section === "fields" ||
      search.section === "name_description" ||
      search.section === "json_preview" ||
      search.section === "settings" ||
      search.section === "workflow"
        ? search.section
        : undefined;
    return {
      ...(modelId ? { modelId } : {}),
      ...(create ? { create } : {}),
      ...(section ? { section } : {}),
    };
  },
  staticData: { titleKey: "nav:NAV_CONTENT_MODELS" },
});
