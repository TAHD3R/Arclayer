import { useParams } from "@tanstack/react-router";

import { ExtensionsView } from "@/pages/_shared/extensions/components/extensions-view";

export function OrganizationExtensionsPage() {
  const { orgId } = useParams({ from: "/o/$orgId/extensions/" });
  return <ExtensionsView scope="organization" organizationId={orgId} />;
}
