import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Archive,
  Building2,
  CircleUserRound,
  FolderKanban,
  LayoutTemplate,
  Lock,
  ShieldCheck,
  UserCheck,
  UserMinus,
  Users,
} from "lucide-react";

import { UserAvatar } from "@/components/common/entity-avatar";
import {
  renderSlugTag,
  renderTag,
  renderTagWithTooltip,
} from "@/pages/system/directory/system-directory-table";
import type {
  DirectoryActorSummary,
  SystemDirectoryOrganizationDetail,
  SystemDirectoryProjectDetail,
  SystemDirectoryUserDetail,
  SystemDirectoryWorkspaceDetail,
} from "@/types/api/system-directory";
import { Button } from "@arclayer/ui/button";
import { SettingSheet } from "@arclayer/ui/setting-sheet";

type UserDetailQuery = {
  detail: SystemDirectoryUserDetail | null;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
};

type OrganizationDetailQuery = {
  detail: SystemDirectoryOrganizationDetail | null;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
};

type WorkspaceDetailQuery = {
  detail: SystemDirectoryWorkspaceDetail | null;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
};

type ProjectDetailQuery = {
  detail: SystemDirectoryProjectDetail | null;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
};

type SystemDirectoryDetailsSheetProps =
  | {
      kind: "user";
      open: boolean;
      onOpenChange: (open: boolean) => void;
      query: UserDetailQuery;
      formatDateTime: (value: string) => string;
      actions?: Array<{
        key: string;
        label: string;
        onClick: () => void;
        variant?: "outline" | "ghost";
      }>;
    }
  | {
      kind: "organization";
      open: boolean;
      onOpenChange: (open: boolean) => void;
      query: OrganizationDetailQuery;
      formatDateTime: (value: string) => string;
    }
  | {
      kind: "workspace";
      open: boolean;
      onOpenChange: (open: boolean) => void;
      query: WorkspaceDetailQuery;
      formatDateTime: (value: string) => string;
    }
  | {
      kind: "project";
      open: boolean;
      onOpenChange: (open: boolean) => void;
      query: ProjectDetailQuery;
      formatDateTime: (value: string) => string;
    };

function getActorPrimary(actor: DirectoryActorSummary | null | undefined) {
  if (!actor) return "-";
  return actor.displayName || actor.username || actor.email || "-";
}

function StatusTag(props: { status: string }) {
  const { t } = useTranslation(["settings"]);

  if (props.status === "active") {
    return renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_ACTIVE"), {
      tone: "green",
      icon: UserCheck,
    });
  }
  if (props.status === "disabled") {
    return renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_DISABLED"), {
      tone: "red",
      icon: UserMinus,
    });
  }
  return renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_LOCKED"), {
    tone: "gold",
    icon: Lock,
  });
}

function ActiveTag(props: { active: boolean }) {
  const { t } = useTranslation(["settings"]);
  return props.active
    ? renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTIVE"), {
        tone: "green",
        icon: FolderKanban,
      })
    : renderTag(t("settings:SETTINGS_DISABLED"), {
        tone: "red",
        icon: Lock,
      });
}

function ArchivedTag(props: { archived: boolean }) {
  const { t } = useTranslation(["settings"]);
  return props.archived
    ? renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_ARCHIVED"), {
        tone: "gold",
        icon: Archive,
      })
    : renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTIVE"), {
        tone: "green",
        icon: FolderKanban,
      });
}

function OrganizationKindTag(props: { kind: string }) {
  const { t } = useTranslation(["settings"]);
  return props.kind === "personal"
    ? renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_KIND_PERSONAL"), {
        tone: "blue",
        icon: CircleUserRound,
      })
    : renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_KIND_TEAM"), {
        tone: "default",
        icon: Building2,
      });
}

function SheetSection(props: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-3 rounded-2xl border border-border/60 bg-muted/[0.03] p-4">
      <div className="text-sm font-medium text-foreground">{props.title}</div>
      {props.children}
    </div>
  );
}

function LabelValue(props: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1">
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div className="text-sm text-foreground">{props.value}</div>
    </div>
  );
}

function CountValue(props: { label: string; value: number; icon: typeof Users }) {
  return (
    <LabelValue label={props.label} value={renderTag(String(props.value), { icon: props.icon })} />
  );
}

function ResponsiblePersonValue(props: { actor: DirectoryActorSummary | null | undefined }) {
  if (!props.actor) return <span className="text-muted-foreground">-</span>;
  const name = getActorPrimary(props.actor);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <UserAvatar
        name={name}
        assetRef={props.actor.avatarUrl ?? props.actor.avatar_url}
        size={28}
      />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-foreground">{name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {props.actor.email || props.actor.username}
        </div>
      </div>
    </div>
  );
}

function ActionRow(props: {
  actions: Array<{
    key: string;
    label: string;
    onClick?: () => void;
    variant?: "outline" | "ghost";
  }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {props.actions.map((action) => (
        <Button
          key={action.key}
          type="button"
          size="sm"
          variant={action.variant ?? "outline"}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}

function LoadingState() {
  const { t } = useTranslation(["settings"]);
  return (
    <div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/[0.04] text-sm text-muted-foreground">
      {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_LOADING")}
    </div>
  );
}

function ErrorState(props: { onRetry: () => void }) {
  const { t } = useTranslation(["settings", "common"]);
  return (
    <div className="grid gap-4 rounded-2xl border border-border/60 bg-muted/[0.04] p-5">
      <div className="text-sm text-muted-foreground">
        {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_LOAD_ERROR")}
      </div>
      <div>
        <Button variant="outline" size="sm" onClick={props.onRetry}>
          {t("common:RETRY")}
        </Button>
      </div>
    </div>
  );
}

function UserDetailsBody(props: {
  detail: SystemDirectoryUserDetail;
  formatDateTime: (value: string) => string;
  actions?: Array<{
    key: string;
    label: string;
    onClick: () => void;
    variant?: "outline" | "ghost";
  }>;
}) {
  const { t } = useTranslation(["settings"]);
  const linkedOauthProviders =
    props.detail.linkedOauthProviders ?? props.detail.linked_oauth_providers ?? [];

  return (
    <div className="grid gap-4">
      <SheetSection title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_ACCOUNT")}>
        <div className="grid gap-4 md:grid-cols-2">
          <LabelValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_STATUS")}
            value={<StatusTag status={props.detail.status} />}
          />
          <LabelValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_PERMISSION")}
            value={
              props.detail.isSuperAdmin
                ? renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_SUPER_ADMIN_ON"), {
                    tone: "green",
                    icon: ShieldCheck,
                  })
                : renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_SUPER_ADMIN_OFF"))
            }
          />
          <LabelValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_LAST_LOGIN")}
            value={props.detail.lastLoginAt ? props.formatDateTime(props.detail.lastLoginAt) : "-"}
          />
          <LabelValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_UPDATED_AT")}
            value={props.formatDateTime(props.detail.updatedAt)}
          />
        </div>
      </SheetSection>

      <SheetSection title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_ACCESS")}>
        <div className="grid gap-4 md:grid-cols-2">
          <LabelValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_PASSWORD_MODE")}
            value={
              props.detail.hasPassword
                ? renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_PASSWORD_MODE_ENABLED"), {
                    tone: "green",
                    icon: Lock,
                  })
                : renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_PASSWORD_MODE_EMPTY"), {
                    tone: "default",
                  })
            }
          />
          <LabelValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TWO_FACTOR")}
            value={
              props.detail.twoFactorEnabled
                ? renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TWO_FACTOR_ENABLED"), {
                    tone: "green",
                    icon: ShieldCheck,
                  })
                : renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TWO_FACTOR_DISABLED"), {
                    tone: "default",
                  })
            }
          />
          <LabelValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_LINKED_OAUTH")}
            value={
              linkedOauthProviders.length ? (
                <div className="flex flex-wrap gap-2">
                  {linkedOauthProviders.map((provider) => (
                    <span key={provider}>{renderTag(provider, { tone: "blue" })}</span>
                  ))}
                </div>
              ) : (
                t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_LINKED_OAUTH_EMPTY")
              )
            }
          />
          <LabelValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_LOGIN_SESSION")}
            value={renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_LOGIN_SESSION_SUMMARY"))}
          />
        </div>
      </SheetSection>

      <SheetSection title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_SCOPE")}>
        <div className="grid gap-4 md:grid-cols-2">
          <CountValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_ORGANIZATIONS")}
            value={props.detail.organizationMembershipCount}
            icon={Building2}
          />
          <CountValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_WORKSPACES")}
            value={props.detail.workspaceMembershipCount}
            icon={FolderKanban}
          />
          <CountValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_PROJECTS")}
            value={props.detail.projectMembershipCount}
            icon={LayoutTemplate}
          />
          <CountValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_OWNED_ORGANIZATIONS")}
            value={props.detail.ownedOrganizationsCount}
            icon={Users}
          />
        </div>
      </SheetSection>

      <SheetSection title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_ACTIONS")}>
        <ActionRow
          actions={
            props.actions ?? [
              {
                key: "edit",
                label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_EDIT_ACCOUNT"),
              },
              {
                key: "reset-password",
                label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_RESET_PASSWORD"),
              },
              {
                key: "revoke-sessions",
                label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_REVOKE_LOGIN_SESSIONS"),
              },
            ]
          }
        />
      </SheetSection>
    </div>
  );
}

function OrganizationDetailsBody(props: {
  detail: SystemDirectoryOrganizationDetail;
  formatDateTime: (value: string) => string;
}) {
  const { t } = useTranslation(["settings"]);

  return (
    <div className="grid gap-4">
      <SheetSection title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_OVERVIEW")}>
        <div className="grid gap-4 md:grid-cols-2">
          <LabelValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_RESPONSIBLE_PERSON")}
            value={<ResponsiblePersonValue actor={props.detail.owner} />}
          />
          <LabelValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_KIND")}
            value={<OrganizationKindTag kind={props.detail.kind} />}
          />
          <LabelValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_STATUS")}
            value={<ActiveTag active={props.detail.isActive} />}
          />
          <LabelValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_SLUG")}
            value={renderSlugTag(props.detail.slug)}
          />
        </div>
      </SheetSection>

      <SheetSection title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_SCOPE")}>
        <div className="grid gap-4 md:grid-cols-3">
          <CountValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_MEMBERS")}
            value={props.detail.memberCount}
            icon={Users}
          />
          <CountValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_WORKSPACES")}
            value={props.detail.workspaceCount}
            icon={FolderKanban}
          />
          <CountValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_PROJECTS")}
            value={props.detail.projectCount}
            icon={LayoutTemplate}
          />
        </div>
      </SheetSection>

      <SheetSection title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_ACTIVITY")}>
        <div className="grid gap-4 md:grid-cols-2">
          <LabelValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_CREATED_AT")}
            value={props.formatDateTime(props.detail.createdAt)}
          />
          <LabelValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_UPDATED_AT")}
            value={props.formatDateTime(props.detail.updatedAt)}
          />
        </div>
      </SheetSection>

      <SheetSection title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_ACTIONS")}>
        <ActionRow
          actions={[
            {
              key: "edit",
              label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_EDIT_ORGANIZATION"),
            },
            {
              key: "assign-lead",
              label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ASSIGN_RESPONSIBLE_PERSON"),
            },
          ]}
        />
      </SheetSection>
    </div>
  );
}

function WorkspaceDetailsBody(props: {
  detail: SystemDirectoryWorkspaceDetail;
  formatDateTime: (value: string) => string;
}) {
  const { t } = useTranslation(["settings"]);

  return (
    <div className="grid gap-4">
      <SheetSection title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_OVERVIEW")}>
        <div className="grid gap-4 md:grid-cols-2">
          <LabelValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_ORGANIZATION")}
            value={renderTagWithTooltip(props.detail.organizationName, { icon: Building2 })}
          />
          <LabelValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_RESPONSIBLE_PERSON")}
            value={<ResponsiblePersonValue actor={props.detail.owner} />}
          />
          <LabelValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_STATUS")}
            value={
              <div className="flex flex-wrap gap-2">
                <ActiveTag active={props.detail.isActive} />
                <ArchivedTag archived={props.detail.isArchived} />
              </div>
            }
          />
          <LabelValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_DESCRIPTION")}
            value={props.detail.description || "-"}
          />
        </div>
      </SheetSection>

      <SheetSection title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_SCOPE")}>
        <div className="grid gap-4 md:grid-cols-2">
          <CountValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_MEMBERS")}
            value={props.detail.memberCount}
            icon={Users}
          />
          <CountValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_PROJECTS")}
            value={props.detail.projectCount}
            icon={LayoutTemplate}
          />
        </div>
      </SheetSection>

      <SheetSection title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_ACTIVITY")}>
        <div className="grid gap-4 md:grid-cols-2">
          <LabelValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_CREATED_AT")}
            value={props.formatDateTime(props.detail.createdAt)}
          />
          <LabelValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_UPDATED_AT")}
            value={props.formatDateTime(props.detail.updatedAt)}
          />
        </div>
      </SheetSection>

      <SheetSection title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_ACTIONS")}>
        <ActionRow
          actions={[
            {
              key: "manage-roles",
              label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_MANAGE_ROLES"),
            },
            {
              key: "archive",
              label: props.detail.isArchived
                ? t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_RESTORE_WORKSPACE")
                : t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ARCHIVE_WORKSPACE"),
            },
            {
              key: "delete",
              label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DELETE_WORKSPACE"),
            },
          ]}
        />
      </SheetSection>
    </div>
  );
}

function ProjectDetailsBody(props: {
  detail: SystemDirectoryProjectDetail;
  formatDateTime: (value: string) => string;
}) {
  const { t } = useTranslation(["settings"]);

  return (
    <div className="grid gap-4">
      <SheetSection title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_OVERVIEW")}>
        <div className="grid gap-4 md:grid-cols-2">
          <LabelValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_ORGANIZATION")}
            value={renderTagWithTooltip(props.detail.organizationName, { icon: Building2 })}
          />
          <LabelValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_WORKSPACE")}
            value={renderTagWithTooltip(props.detail.workspaceName, { icon: FolderKanban })}
          />
          <LabelValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_RESPONSIBLE_PERSON")}
            value={<ResponsiblePersonValue actor={props.detail.owner} />}
          />
          <LabelValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_SLUG")}
            value={renderSlugTag(props.detail.slug)}
          />
        </div>
      </SheetSection>

      <SheetSection title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_SCOPE")}>
        <div className="grid gap-4 md:grid-cols-2">
          <CountValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_MEMBERS")}
            value={props.detail.memberCount}
            icon={Users}
          />
          <LabelValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_STATUS")}
            value={<ActiveTag active={props.detail.isActive} />}
          />
        </div>
      </SheetSection>

      <SheetSection title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_ACTIVITY")}>
        <div className="grid gap-4 md:grid-cols-2">
          <LabelValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_CREATED_AT")}
            value={props.formatDateTime(props.detail.createdAt)}
          />
          <LabelValue
            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_UPDATED_AT")}
            value={props.formatDateTime(props.detail.updatedAt)}
          />
        </div>
      </SheetSection>

      <SheetSection title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_ACTIONS")}>
        <ActionRow
          actions={[
            {
              key: "archive",
              label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ARCHIVE_PROJECT"),
            },
            {
              key: "delete",
              label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DELETE_PROJECT"),
            },
          ]}
        />
      </SheetSection>
    </div>
  );
}

export function SystemDirectoryDetailsSheet(props: SystemDirectoryDetailsSheetProps) {
  const { t } = useTranslation(["settings", "common"]);

  const common = {
    open: props.open,
    onOpenChange: props.onOpenChange,
    contentClassName: "w-[36rem] max-w-[96vw]",
    bodyClassName: "pb-6",
  } as const;

  const renderBody = (body: ReactNode) => {
    if (props.query.isError) {
      return <ErrorState onRetry={() => void props.query.refetch()} />;
    }
    if (props.query.isLoading || !props.query.detail) {
      return <LoadingState />;
    }
    return body;
  };

  if (props.kind === "user") {
    const detail = props.query.detail;
    return (
      <SettingSheet
        {...common}
        title={
          detail
            ? detail.displayName || detail.username
            : t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_USER_TITLE")
        }
        description={detail?.email || t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_USER_DESC")}
      >
        {renderBody(
          detail ? (
            <UserDetailsBody
              detail={detail}
              formatDateTime={props.formatDateTime}
              actions={props.actions}
            />
          ) : null,
        )}
      </SettingSheet>
    );
  }

  if (props.kind === "organization") {
    const detail = props.query.detail;
    return (
      <SettingSheet
        {...common}
        title={detail?.name || t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_ORGANIZATION_TITLE")}
        description={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_ORGANIZATION_DESC")}
      >
        {renderBody(
          detail ? (
            <OrganizationDetailsBody detail={detail} formatDateTime={props.formatDateTime} />
          ) : null,
        )}
      </SettingSheet>
    );
  }

  if (props.kind === "workspace") {
    const detail = props.query.detail;
    return (
      <SettingSheet
        {...common}
        title={detail?.name || t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_WORKSPACE_TITLE")}
        description={
          detail?.organizationName || t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_WORKSPACE_DESC")
        }
      >
        {renderBody(
          detail ? (
            <WorkspaceDetailsBody detail={detail} formatDateTime={props.formatDateTime} />
          ) : null,
        )}
      </SettingSheet>
    );
  }

  const detail = props.query.detail;
  return (
    <SettingSheet
      {...common}
      title={detail?.name || t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_PROJECT_TITLE")}
      description={
        detail?.workspaceName || t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_PROJECT_DESC")
      }
    >
      {renderBody(
        detail ? (
          <ProjectDetailsBody detail={detail} formatDateTime={props.formatDateTime} />
        ) : null,
      )}
    </SettingSheet>
  );
}
