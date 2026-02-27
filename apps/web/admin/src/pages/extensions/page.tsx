import { ExtensionsView } from "./components/extensions-view";

export type { PluginScope } from "./types";

type ExtensionsPageProps = {
  scope?: "workspace" | "organization";
  organizationId?: string;
};

export function ExtensionsPage({ scope, organizationId }: ExtensionsPageProps) {
  return <ExtensionsView scope={scope} organizationId={organizationId} />;
}
