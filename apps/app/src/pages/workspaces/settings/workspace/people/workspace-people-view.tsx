import { Link2, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { TeamInvitationsPage } from "@/pages/workspaces/team/invitations/page";
import { TeamMembersView } from "@/pages/workspaces/team/members/components/team-members-view";
import { Button } from "@arclayer/ui/button";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@arclayer/ui/chrome-tabs";

type PeopleView = "people" | "pending" | "links";

function viewForSection(section?: string): PeopleView {
  if (section === "pending-invitations" || section === "create-invitation") return "pending";
  if (section === "invite-links") return "links";
  return "people";
}

export function WorkspacePeopleView(props: {
  workspaceId: string;
  targetSection?: string;
  initialSearchQuery?: string;
  initialInspectMemberId?: string;
}) {
  const { t } = useTranslation(["team", "common"]);
  const [view, setView] = useState<PeopleView>(() => viewForSection(props.targetSection));
  const [inviteMemberOpen, setInviteMemberOpen] = useState(
    props.targetSection === "invite-member" || props.targetSection === "create-invitation",
  );
  const [inviteLinkOpen, setInviteLinkOpen] = useState(props.targetSection === "invite-links");

  useEffect(() => {
    setView(viewForSection(props.targetSection));
    if (props.targetSection === "invite-member" || props.targetSection === "create-invitation") {
      setInviteMemberOpen(true);
    }
    if (props.targetSection === "invite-links") setInviteLinkOpen(true);
  }, [props.targetSection]);

  const action =
    view === "links" ? (
      <Button onClick={() => setInviteLinkOpen(true)}>
        <Link2 data-icon="inline-start" />
        {t("team:TEAM_INVITE_CREATE_LINK_ACTION")}
      </Button>
    ) : (
      <Button onClick={() => setInviteMemberOpen(true)}>
        <Plus data-icon="inline-start" />
        {t("team:TEAM_INVITE_MEMBER")}
      </Button>
    );

  return (
    <ChromeTabs value={view} onValueChange={(value) => setView(value as PeopleView)}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ChromeTabsList aria-label={t("team:TEAM_PEOPLE_VIEWS_LABEL")}>
          <ChromeTabsTrigger value="people">{t("team:TEAM_PEOPLE_TAB_PEOPLE")}</ChromeTabsTrigger>
          <ChromeTabsTrigger value="pending">{t("team:TEAM_PEOPLE_TAB_PENDING")}</ChromeTabsTrigger>
          <ChromeTabsTrigger value="links">{t("team:TEAM_PEOPLE_TAB_LINKS")}</ChromeTabsTrigger>
        </ChromeTabsList>
        {action}
      </div>

      <ChromeTabsContent value="people">
        <TeamMembersView
          workspaceIdOverride={props.workspaceId}
          initialSearchQuery={props.initialSearchQuery}
          initialInspectMemberId={props.initialInspectMemberId}
          inviteOpen={inviteMemberOpen}
          onInviteOpenChange={setInviteMemberOpen}
          embedded
        />
      </ChromeTabsContent>
      <ChromeTabsContent value="pending">
        <TeamInvitationsPage
          workspaceIdOverride={props.workspaceId}
          fixedTab="pending"
          inviteEmailOpen={inviteMemberOpen}
          onInviteEmailOpenChange={setInviteMemberOpen}
          embedded
        />
      </ChromeTabsContent>
      <ChromeTabsContent value="links">
        <TeamInvitationsPage
          workspaceIdOverride={props.workspaceId}
          fixedTab="links"
          inviteLinkOpen={inviteLinkOpen}
          onInviteLinkOpenChange={setInviteLinkOpen}
          embedded
        />
      </ChromeTabsContent>
    </ChromeTabs>
  );
}
