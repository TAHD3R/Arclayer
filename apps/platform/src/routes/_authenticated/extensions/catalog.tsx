import { createFileRoute } from "@tanstack/react-router";
import { ExtensionsCatalogPage } from "@/pages/extensions";

export const Route = createFileRoute("/_authenticated/extensions/catalog")({
  component: ExtensionsCatalogPage,
});
