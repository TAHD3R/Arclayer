import { createFileRoute } from "@tanstack/react-router";
import { ExtensionsInstalledPage } from "@/pages/extensions";

export const Route = createFileRoute("/_authenticated/extensions/installed")({
  component: ExtensionsInstalledPage,
});
