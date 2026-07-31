import { createFileRoute } from "@tanstack/react-router";
import { ExtensionsHistoryPage } from "@/pages/extensions";

export const Route = createFileRoute("/_authenticated/extensions/history")({
  component: ExtensionsHistoryPage,
});
