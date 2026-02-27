import { ExtensionsView } from "@/components/extensions/extensions-view";

type OrganizationExtensionsPageProps = {
  organizationId: string;
};

export function OrganizationExtensionsPage({ organizationId }: OrganizationExtensionsPageProps) {
  return <ExtensionsView scope="organization" organizationId={organizationId} />;
}
