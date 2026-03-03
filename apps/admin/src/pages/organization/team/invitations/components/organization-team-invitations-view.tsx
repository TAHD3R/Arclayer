import { Button as AntButton } from "antd";
import { Plus } from "lucide-react";

import { DefaultPage } from "@/components/common/default-page";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@celestial/ui/chrome-tabs";
import {
  InviteOrganizationMemberDialog,
  type InviteOrganizationMemberFormValues,
} from "@/pages/organization/team/shared/components/invite-organization-member-dialog";
import { TeamInvitationsTableSection } from "@/pages/_shared/team/components/team-invitations-table-section";

import type { OrgInvitationsTab } from "../constants";
import { OrganizationTeamInvitationsDialogs } from "./invitations-dialogs";
import { useOrganizationTeamInvitations } from "../hooks/use-organization-team-invitations";

export function OrganizationTeamInvitationsView() {
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
      width="fixed"
      title={t("nav:NAV_SETTINGS_TEAM_MEMBERS")}
      description={t("common:ORG_INVITATIONS_DESC")}
      action={
        <div className="flex items-center gap-2">
          <AntButton onClick={() => setLinkCreateOpen(true)} autoInsertSpace={false}>
            {t("team:TEAM_INVITE_CREATE_LINK_ACTION")}
          </AntButton>
          <AntButton
            type="primary"
            icon={<Plus size={16} />}
            onClick={() => setInviteOpen(true)}
            autoInsertSpace={false}
          >
            {t("common:ORG_MEMBERS_INVITE")}
          </AntButton>
        </div>
      }
      contentClassName="min-h-0 flex flex-col"
    >
      <ChromeTabs value={tab} onValueChange={(next) => setTab(next as OrgInvitationsTab)}>
        <ChromeTabsList className="w-auto">
          <ChromeTabsTrigger value="pending">
            {t("team:TEAM_INVITATION_TAB_PENDING")}
          </ChromeTabsTrigger>
          <ChromeTabsTrigger value="processed">
            {t("team:TEAM_INVITATION_TAB_PROCESSED")}
          </ChromeTabsTrigger>
          <ChromeTabsTrigger value="links">{t("team:TEAM_INVITATION_TAB_LINKS")}</ChromeTabsTrigger>
        </ChromeTabsList>

        <ChromeTabsContent value="pending" className="min-h-0 flex-1">
          <TeamInvitationsTableSection
            t={t}
            tableHook={pendingTable}
            placeholder={t("team:TEAM_INVITATIONS_SEARCH_PLACEHOLDER")}
            emptyTitle={t("common:EMPTY_TITLE")}
            emptyDescription={t("team:TEAM_INVITATIONS_EMPTY_DESC")}
            showSearch
          />
        </ChromeTabsContent>

        <ChromeTabsContent value="processed" className="min-h-0 flex-1">
          <TeamInvitationsTableSection
            t={t}
            tableHook={processedTable}
            placeholder={t("team:TEAM_INVITATIONS_SEARCH_PLACEHOLDER")}
            emptyTitle={t("common:EMPTY_TITLE")}
            emptyDescription={t("team:TEAM_INVITATIONS_EMPTY_DESC")}
            showSearch
          />
        </ChromeTabsContent>

        <ChromeTabsContent value="links" className="min-h-0 flex-1">
          <TeamInvitationsTableSection
            t={t}
            tableHook={linksTable}
            placeholder={t("team:TEAM_INVITE_LINKS_SEARCH_PLACEHOLDER")}
            emptyTitle={t("common:EMPTY_TITLE")}
            emptyDescription={t("team:TEAM_INVITE_LINKS_EMPTY_DESC")}
            showSearch
          />
        </ChromeTabsContent>
      </ChromeTabs>

      <InviteOrganizationMemberDialog
        open={inviteOpen}
        onOpenChange={(next) => setInviteOpen(next)}
        roleOptions={roleOptionItems}
        defaultRoleCode={defaultRoleCode}
        loading={invitePending}
        onSubmit={async (values: InviteOrganizationMemberFormValues) => submitInviteMembers(values)}
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
