import { useParams } from "@tanstack/react-router";

import { ExtensionDetailPage } from "@/pages/_shared/extensions/components/extension-detail-page";

import { useOrganizationExtensionDetail } from "./hooks/use-organization-extension-detail";

export function OrganizationExtensionDetailPage() {
  const { orgId: organizationId, extensionSlug } = useParams({
    from: "/o/$orgId/extensions/$extensionSlug/",
  });
  const detail = useOrganizationExtensionDetail({ organizationId, extensionRef: extensionSlug });

  return <ExtensionDetailPage {...detail} />;
}
