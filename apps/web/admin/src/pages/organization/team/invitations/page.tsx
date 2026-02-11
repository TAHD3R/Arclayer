import { Button as AntButton } from "antd";
import { Plus } from "lucide-react";

import { DefaultPage } from "@/components/common/default-page";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@/components/ui/chrome-tabs";
import {
  InviteOrganizationMemberDialog,
  type InviteOrganizationMemberFormValues,
} from "@/pages/organization/team/shared/invite-organization-member-dialog";
import { TeamInvitationsTableSection } from "@/pages/workspaces/team/invitations/invitations-table-section";

import type { OrgInvitationsTab } from "./invitations-constants";
import { OrganizationTeamInvitationsDialogs } from "./invitations-dialogs";
import { useOrganizationTeamInvitations } from "./use-organization-team-invitations";

export function OrganizationTeamInvitationsPage() {
  const {
    t,
    tab,
    setTab,
    pendingTable,
    processedTable,
    linksTable,
    inviteOpen,
    setInviteOpen,
    submitInviteMembers,
    invitePending,
    roleOptionItems,
    defaultRoleCode,
    linkCreateOpen,
    setLinkCreateOpen,
    linkRoleCode,
    setLinkRoleCode,
    linkExpiresInSeconds,
    setLinkExpiresInSeconds,
    linkAllowedDomain,
    setLinkAllowedDomain,
    createLinkPending,
    createLink,
    renewOptions,
    renewExpiresInSeconds,
    setRenewExpiresInSeconds,
    renewInvitationDialog,
    renewInvitationPending,
    renewInvitationById,
    revokeInvitationDialog,
    revokeInvitationPending,
    revokeInvitationById,
    renewLinkDialog,
    renewLinkPending,
    renewLinkById,
    disableLinkDialog,
    disableLinkPending,
    disableLinkById,
  } = useOrganizationTeamInvitations();

  return (
    <DefaultPage
      width="full"
      title={t("nav:NAV_SETTINGS_TEAM_MEMBERS")}
      description={t("common:ORG_INVITATIONS_DESC")}
      action={
        <div className="flex items-center gap-2">
          <AntButton type="primary" icon={<Plus size={16} />} onClick={() => setInviteOpen(true)}>
            {t("common:ORG_MEMBERS_INVITE")}
          </AntButton>
          <AntButton onClick={() => setLinkCreateOpen(true)}>
            {t("team:TEAM_INVITE_CREATE_LINK_ACTION")}
          </AntButton>
        </div>
      }
      contentClassName="min-h-0 flex flex-col"
    >
      <ChromeTabs value={tab} onValueChange={(next) => setTab(next as OrgInvitationsTab)}>
        <ChromeTabsList className="w-auto">
          <ChromeTabsTrigger value="pending">
            {t("team:TEAM_INVITATIONS_TAB_PENDING")}
          </ChromeTabsTrigger>
          <ChromeTabsTrigger value="processed">
            {t("team:TEAM_INVITATIONS_TAB_ACCEPTED")}
          </ChromeTabsTrigger>
          <ChromeTabsTrigger value="links">
            {t("team:TEAM_INVITATIONS_TAB_LINKS")}
          </ChromeTabsTrigger>
        </ChromeTabsList>

        <ChromeTabsContent value="pending" className="min-h-0 flex flex-col">
          <TeamInvitationsTableSection
            tableHook={pendingTable}
            placeholder={t("team:TEAM_INVITATIONS_SEARCH_PENDING_PLACEHOLDER")}
            emptyTitle={t("common:ORG_INVITATIONS_EMPTY_TITLE")}
            emptyDescription={t("common:ORG_INVITATIONS_EMPTY_DESC")}
            showSearch
            t={t}
          />
        </ChromeTabsContent>

        <ChromeTabsContent value="processed" className="min-h-0 flex flex-col">
          <TeamInvitationsTableSection
            tableHook={processedTable}
            placeholder={t("team:TEAM_INVITATIONS_SEARCH_ACCEPTED_PLACEHOLDER")}
            emptyTitle={t("common:ORG_INVITATIONS_EMPTY_TITLE")}
            emptyDescription={t("common:ORG_INVITATIONS_EMPTY_DESC")}
            showSearch
            t={t}
          />
        </ChromeTabsContent>

        <ChromeTabsContent value="links" className="min-h-0 flex flex-col">
          <TeamInvitationsTableSection
            tableHook={linksTable}
            placeholder={t("team:TEAM_INVITE_LINKS_SEARCH_PLACEHOLDER")}
            emptyTitle={t("team:TEAM_INVITE_LINKS_EMPTY_TITLE")}
            emptyDescription={t("team:TEAM_INVITE_LINKS_EMPTY_DESC")}
            showSearch
            t={t}
          />
        </ChromeTabsContent>
      </ChromeTabs>

      <InviteOrganizationMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        loading={invitePending}
        roleOptions={roleOptionItems}
        defaultRoleCode={defaultRoleCode}
        onSubmit={async (values: InviteOrganizationMemberFormValues) => {
          await submitInviteMembers(values);
        }}
      />

      <OrganizationTeamInvitationsDialogs
        t={t}
        roleOptions={roleOptionItems}
        renewOptions={renewOptions}
        linkCreateOpen={linkCreateOpen}
        onLinkCreateOpenChange={setLinkCreateOpen}
        linkRoleCode={linkRoleCode}
        onLinkRoleCodeChange={setLinkRoleCode}
        linkExpiresInSeconds={linkExpiresInSeconds}
        onLinkExpiresInSecondsChange={setLinkExpiresInSeconds}
        linkAllowedDomain={linkAllowedDomain}
        onLinkAllowedDomainChange={setLinkAllowedDomain}
        createLinkPending={createLinkPending}
        onCreateLink={createLink}
        renewExpiresInSeconds={renewExpiresInSeconds}
        onRenewExpiresInSecondsChange={setRenewExpiresInSeconds}
        renewInvitationDialog={renewInvitationDialog}
        renewInvitationPending={renewInvitationPending}
        onRenewInvitation={renewInvitationById}
        revokeInvitationDialog={revokeInvitationDialog}
        revokeInvitationPending={revokeInvitationPending}
        onRevokeInvitation={revokeInvitationById}
        renewLinkDialog={renewLinkDialog}
        renewLinkPending={renewLinkPending}
        onRenewLink={renewLinkById}
        disableLinkDialog={disableLinkDialog}
        disableLinkPending={disableLinkPending}
        onDisableLink={disableLinkById}
      />
    </DefaultPage>
  );
}
