import { createFileRoute } from "@tanstack/react-router";
import { CommerceConfigurationPage } from "@/pages/commerce-configuration";
export const Route = createFileRoute("/_authenticated/billing/configuration")({
  component: CommerceConfigurationPage,
});
