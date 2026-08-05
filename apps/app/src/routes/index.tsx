import { createFileRoute } from "@tanstack/react-router";

type HomeSearch = {
  prompt?: string;
  settings?: "personal.profile";
  section?: "danger";
};

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch => {
    const prompt = typeof search.prompt === "string" ? search.prompt.slice(0, 500) : "";
    const settings = search.settings === "personal.profile" ? search.settings : undefined;
    const section = settings && search.section === "danger" ? search.section : undefined;
    return {
      ...(prompt.trim() ? { prompt } : {}),
      ...(settings ? { settings } : {}),
      ...(section ? { section } : {}),
    };
  },
  staticData: { titleKey: "nav:NAV_HOME" },
});
