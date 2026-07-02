import { createFileRoute } from "@tanstack/react-router";

type HomeSearch = {
  prompt?: string;
};

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch => {
    const prompt = typeof search.prompt === "string" ? search.prompt.trim() : "";
    return prompt ? { prompt: prompt.slice(0, 500) } : {};
  },
  staticData: { titleKey: "nav:NAV_HOME" },
});
