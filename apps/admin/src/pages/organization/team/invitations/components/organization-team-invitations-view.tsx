import { Plus } from "lucide-react";

import { DefaultPage } from "@/components/common/default-page";
import { Button } from "@celestial/ui/button";
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
          <Button variant="secondary" onClick={() => setLinkCreateOpen(true)}>
            {t("team:TEAM_INVITE_CREATE_LINK_ACTION")}
          </Button>
          <Button onClick={() => setInviteOpen(true)}>
            <Plus size={16} />
            {t("common:ORG_MEMBERS_INVITE")}
          </Button>
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
            tableId="organization-invitations:pending"
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
            tableId="organization-invitations:processed"
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
            tableId="organization-invite-links"
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
