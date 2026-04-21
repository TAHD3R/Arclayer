import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Archive,
  Building2,
  CircleUserRound,
  Crown,
  FolderKanban,
  LayoutTemplate,
  Lock,
  ShieldCheck,
  UserCheck,
  UserMinus,
  Users,
} from "lucide-react";

import {
  OrganizationAvatar,
  UserAvatar,
  WorkspaceAvatar,
  workspaceAvatarPropsFromIdentity,
} from "@/components/common/entity-avatar";
import { renderTag, renderTagWithTooltip } from "@/pages/system/directory/system-directory-table";
import type {
  DirectoryActorSummary,
  SystemDirectoryOrganizationDetail,
  SystemDirectoryProjectDetail,
  SystemDirectoryUserDetail,
  SystemDirectoryWorkspaceDetail,
} from "@/types/api/system-directory";
import { Button } from "@arclayer/ui/button";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
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

function BooleanTag(props: { value: boolean; trueLabel: string; falseLabel: string }) {
  return props.value
    ? renderTag(props.trueLabel, { tone: "gold", icon: Crown })
    : renderTag(props.falseLabel, { tone: "default", icon: ShieldCheck });
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

function CountTag(props: {
  value: number;
  icon: typeof Users;
  tone?: "default" | "blue" | "green";
}) {
  return renderTag(String(props.value), {
    tone: props.tone ?? "default",
    icon: props.icon,
  });
}

function IdentityHeader(props: {
  avatar: ReactNode;
  title: string;
  subtitle?: string | null;
  meta?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-border/60 bg-muted/[0.04] p-4">
      {props.avatar}
      <div className="min-w-0 flex-1">
        <div className="truncate text-title4 font-semibold text-label-primary">{props.title}</div>
        {props.subtitle ? (
          <div className="mt-1 truncate text-body text-label-secondary">{props.subtitle}</div>
        ) : null}
        {props.meta ? <div className="mt-3 flex flex-wrap gap-2">{props.meta}</div> : null}
      </div>
    </div>
  );
}

function FieldValue(props: { value: ReactNode }) {
  return (
    <div className="min-h-9 rounded-xl border border-border/60 bg-background px-3 py-2">
      {props.value}
    </div>
  );
}

function TextValue(props: { value: string | null | undefined }) {
  if (!props.value) return <FieldValue value={<span className="text-label-secondary">-</span>} />;

  return (
    <FieldValue
      value={<div className="break-words text-sm text-label-primary">{props.value}</div>}
    />
  );
}

function TagValue(props: { value: ReactNode }) {
  return <FieldValue value={<div className="flex flex-wrap gap-2">{props.value}</div>} />;
}

function LoadingState() {
  const { t } = useTranslation(["settings"]);
  return (
    <div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/[0.04] text-sm text-label-secondary">
      {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_LOADING")}
    </div>
  );
}

function ErrorState(props: { onRetry: () => void }) {
  const { t } = useTranslation(["settings"]);
  return (
    <div className="grid gap-4 rounded-2xl border border-border/60 bg-muted/[0.04] p-5">
      <div className="text-sm text-label-secondary">
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
}) {
  const { t } = useTranslation(["settings"]);
  return (
    <div className="grid gap-5">
      <IdentityHeader
        avatar={
          <UserAvatar
            name={props.detail.displayName || props.detail.username}
            assetRef={props.detail.avatarUrl ?? props.detail.avatar_url}
            size={56}
          />
        }
        title={props.detail.displayName || props.detail.username}
        subtitle={props.detail.email || props.detail.username}
        meta={
          <>
            <StatusTag status={props.detail.status} />
            <BooleanTag
              value={props.detail.isSuperAdmin}
              trueLabel={t("settings:SETTINGS_SYSTEM_DIRECTORY_SUPER_ADMIN_ON")}
              falseLabel={t("settings:SETTINGS_SYSTEM_DIRECTORY_SUPER_ADMIN_OFF")}
            />
          </>
        }
      />

      <SettingDialogFields>
        <SettingDialogField title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_ACCOUNT")}>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_USER")}
              </div>
              <TextValue value={props.detail.username} />
            </div>
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_EMAIL")}
              </div>
              <TextValue value={props.detail.email} />
            </div>
          </div>
        </SettingDialogField>

        <SettingDialogField title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_ACCESS")}>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_STATUS")}
              </div>
              <TagValue value={<StatusTag status={props.detail.status} />} />
            </div>
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_SUPER_ADMIN")}
              </div>
              <TagValue
                value={
                  <BooleanTag
                    value={props.detail.isSuperAdmin}
                    trueLabel={t("settings:SETTINGS_SYSTEM_DIRECTORY_SUPER_ADMIN_ON")}
                    falseLabel={t("settings:SETTINGS_SYSTEM_DIRECTORY_SUPER_ADMIN_OFF")}
                  />
                }
              />
            </div>
          </div>
        </SettingDialogField>

        <SettingDialogField title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_SCOPE")}>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_ORGANIZATIONS")}
              </div>
              <TagValue
                value={
                  <CountTag value={props.detail.organizationMembershipCount} icon={Building2} />
                }
              />
            </div>
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_WORKSPACES")}
              </div>
              <TagValue
                value={
                  <CountTag
                    value={props.detail.workspaceMembershipCount}
                    icon={FolderKanban}
                    tone="blue"
                  />
                }
              />
            </div>
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_PROJECTS")}
              </div>
              <TagValue
                value={
                  <CountTag value={props.detail.projectMembershipCount} icon={LayoutTemplate} />
                }
              />
            </div>
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_OWNED_ORGANIZATIONS")}
              </div>
              <TagValue
                value={<CountTag value={props.detail.ownedOrganizationsCount} icon={Users} />}
              />
            </div>
          </div>
        </SettingDialogField>

        <SettingDialogField
          title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_ACTIVITY")}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_LAST_LOGIN")}
              </div>
              <TextValue
                value={
                  props.detail.lastLoginAt ? props.formatDateTime(props.detail.lastLoginAt) : null
                }
              />
            </div>
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_CREATED_AT")}
              </div>
              <TextValue value={props.formatDateTime(props.detail.createdAt)} />
            </div>
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_UPDATED_AT")}
              </div>
              <TextValue value={props.formatDateTime(props.detail.updatedAt)} />
            </div>
          </div>
        </SettingDialogField>
      </SettingDialogFields>
    </div>
  );
}

function OrganizationDetailsBody(props: {
  detail: SystemDirectoryOrganizationDetail;
  formatDateTime: (value: string) => string;
}) {
  const { t } = useTranslation(["settings"]);
  const ownerName = getActorPrimary(props.detail.owner);
  return (
    <div className="grid gap-5">
      <IdentityHeader
        avatar={
          <OrganizationAvatar name={props.detail.name} assetRef={props.detail.logoUrl} size={56} />
        }
        title={props.detail.name}
        subtitle={props.detail.slug}
        meta={
          <>
            <OrganizationKindTag kind={props.detail.kind} />
            <ActiveTag active={props.detail.isActive} />
          </>
        }
      />

      <SettingDialogFields>
        <SettingDialogField
          title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_OVERVIEW")}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_ORGANIZATION")}
              </div>
              <TextValue value={props.detail.name} />
            </div>
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_SLUG")}
              </div>
              <TagValue value={renderTagWithTooltip(props.detail.slug)} />
            </div>
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_KIND")}
              </div>
              <TagValue value={<OrganizationKindTag kind={props.detail.kind} />} />
            </div>
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_STATUS")}
              </div>
              <TagValue value={<ActiveTag active={props.detail.isActive} />} />
            </div>
          </div>
        </SettingDialogField>

        <SettingDialogField title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_OWNER")}>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_OWNER")}
              </div>
              <FieldValue
                value={
                  props.detail.owner ? (
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        name={ownerName}
                        assetRef={props.detail.owner.avatarUrl ?? props.detail.owner.avatar_url}
                        size={32}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-label-primary">
                          {ownerName}
                        </div>
                        <div className="truncate text-footnote text-label-secondary">
                          {props.detail.owner.email || props.detail.owner.username}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <span className="text-label-secondary">-</span>
                  )
                }
              />
            </div>
          </div>
        </SettingDialogField>

        <SettingDialogField title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_SCOPE")}>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_MEMBERS")}
              </div>
              <TagValue
                value={<CountTag value={props.detail.memberCount} icon={Users} tone="blue" />}
              />
            </div>
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_WORKSPACES")}
              </div>
              <TagValue
                value={
                  <CountTag value={props.detail.workspaceCount} icon={FolderKanban} tone="blue" />
                }
              />
            </div>
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_PROJECTS")}
              </div>
              <TagValue
                value={<CountTag value={props.detail.projectCount} icon={LayoutTemplate} />}
              />
            </div>
          </div>
        </SettingDialogField>

        <SettingDialogField
          title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_ACTIVITY")}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_CREATED_AT")}
              </div>
              <TextValue value={props.formatDateTime(props.detail.createdAt)} />
            </div>
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_UPDATED_AT")}
              </div>
              <TextValue value={props.formatDateTime(props.detail.updatedAt)} />
            </div>
          </div>
        </SettingDialogField>
      </SettingDialogFields>
    </div>
  );
}

function WorkspaceDetailsBody(props: {
  detail: SystemDirectoryWorkspaceDetail;
  formatDateTime: (value: string) => string;
}) {
  const { t } = useTranslation(["settings"]);
  const ownerName = getActorPrimary(props.detail.owner);
  return (
    <div className="grid gap-5">
      <IdentityHeader
        avatar={
          <WorkspaceAvatar
            name={props.detail.name}
            size={56}
            {...workspaceAvatarPropsFromIdentity({
              iconMode: props.detail.iconMode,
              iconColor: props.detail.iconColor,
              iconGlyph: props.detail.iconGlyph,
              iconEmoji: props.detail.iconEmoji,
              iconUrl: props.detail.iconUrl,
            })}
          />
        }
        title={props.detail.name}
        subtitle={props.detail.organizationName}
        meta={
          <>
            <ActiveTag active={props.detail.isActive} />
            <ArchivedTag archived={props.detail.isArchived} />
          </>
        }
      />

      <SettingDialogFields>
        <SettingDialogField
          title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_OVERVIEW")}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_WORKSPACE")}
              </div>
              <TextValue value={props.detail.name} />
            </div>
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_ORGANIZATION")}
              </div>
              <TextValue value={props.detail.organizationName} />
            </div>
            <div className="md:col-span-2">
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_DESCRIPTION")}
              </div>
              <TextValue value={props.detail.description} />
            </div>
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_KIND")}
              </div>
              <TextValue value={props.detail.kind} />
            </div>
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_STATUS")}
              </div>
              <TagValue
                value={
                  <>
                    <ActiveTag active={props.detail.isActive} />
                    <ArchivedTag archived={props.detail.isArchived} />
                  </>
                }
              />
            </div>
          </div>
        </SettingDialogField>

        <SettingDialogField title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_OWNER")}>
          <div className="grid gap-3">
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_OWNER")}
              </div>
              <FieldValue
                value={
                  props.detail.owner ? (
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        name={ownerName}
                        assetRef={props.detail.owner.avatarUrl ?? props.detail.owner.avatar_url}
                        size={32}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-label-primary">
                          {ownerName}
                        </div>
                        <div className="truncate text-footnote text-label-secondary">
                          {props.detail.owner.email || props.detail.owner.username}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <span className="text-label-secondary">-</span>
                  )
                }
              />
            </div>
          </div>
        </SettingDialogField>

        <SettingDialogField title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_SCOPE")}>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_MEMBERS")}
              </div>
              <TagValue
                value={<CountTag value={props.detail.memberCount} icon={Users} tone="blue" />}
              />
            </div>
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_PROJECTS")}
              </div>
              <TagValue
                value={<CountTag value={props.detail.projectCount} icon={LayoutTemplate} />}
              />
            </div>
          </div>
        </SettingDialogField>

        <SettingDialogField
          title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_ACTIVITY")}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_CREATED_AT")}
              </div>
              <TextValue value={props.formatDateTime(props.detail.createdAt)} />
            </div>
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_UPDATED_AT")}
              </div>
              <TextValue value={props.formatDateTime(props.detail.updatedAt)} />
            </div>
          </div>
        </SettingDialogField>
      </SettingDialogFields>
    </div>
  );
}

function ProjectDetailsBody(props: {
  detail: SystemDirectoryProjectDetail;
  formatDateTime: (value: string) => string;
}) {
  const { t } = useTranslation(["settings"]);
  const ownerName = getActorPrimary(props.detail.owner);
  return (
    <div className="grid gap-5">
      <IdentityHeader
        avatar={
          <WorkspaceAvatar
            name={props.detail.name}
            size={56}
            {...workspaceAvatarPropsFromIdentity({
              iconMode: props.detail.iconMode,
              iconColor: props.detail.iconColor,
              iconGlyph: props.detail.iconGlyph,
              iconEmoji: props.detail.iconEmoji,
              iconUrl: props.detail.iconUrl,
            })}
          />
        }
        title={props.detail.name}
        subtitle={props.detail.workspaceName}
        meta={<ActiveTag active={props.detail.isActive} />}
      />

      <SettingDialogFields>
        <SettingDialogField
          title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_OVERVIEW")}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_PROJECT")}
              </div>
              <TextValue value={props.detail.name} />
            </div>
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_SLUG")}
              </div>
              <TagValue value={renderTagWithTooltip(props.detail.slug)} />
            </div>
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_WORKSPACE")}
              </div>
              <TextValue value={props.detail.workspaceName} />
            </div>
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_ORGANIZATION")}
              </div>
              <TextValue value={props.detail.organizationName} />
            </div>
            <div className="md:col-span-2">
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_DESCRIPTION")}
              </div>
              <TextValue value={props.detail.description} />
            </div>
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_STATUS")}
              </div>
              <TagValue value={<ActiveTag active={props.detail.isActive} />} />
            </div>
          </div>
        </SettingDialogField>

        <SettingDialogField title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_OWNER")}>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_OWNER")}
              </div>
              <FieldValue
                value={
                  props.detail.owner ? (
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        name={ownerName}
                        assetRef={props.detail.owner.avatarUrl ?? props.detail.owner.avatar_url}
                        size={32}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-label-primary">
                          {ownerName}
                        </div>
                        <div className="truncate text-footnote text-label-secondary">
                          {props.detail.owner.email || props.detail.owner.username}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <span className="text-label-secondary">-</span>
                  )
                }
              />
            </div>
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_MEMBERS")}
              </div>
              <TagValue
                value={<CountTag value={props.detail.memberCount} icon={Users} tone="blue" />}
              />
            </div>
          </div>
        </SettingDialogField>

        <SettingDialogField
          title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_ACTIVITY")}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_CREATED_AT")}
              </div>
              <TextValue value={props.formatDateTime(props.detail.createdAt)} />
            </div>
            <div>
              <div className="mb-2 text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_UPDATED_AT")}
              </div>
              <TextValue value={props.formatDateTime(props.detail.updatedAt)} />
            </div>
          </div>
        </SettingDialogField>
      </SettingDialogFields>
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
    return (
      <SettingSheet
        {...common}
        title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_USER_TITLE")}
        description={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_USER_DESC")}
      >
        {renderBody(
          <UserDetailsBody detail={props.query.detail!} formatDateTime={props.formatDateTime} />,
        )}
      </SettingSheet>
    );
  }

  if (props.kind === "organization") {
    return (
      <SettingSheet
        {...common}
        title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_ORGANIZATION_TITLE")}
        description={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_ORGANIZATION_DESC")}
      >
        {renderBody(
          <OrganizationDetailsBody
            detail={props.query.detail!}
            formatDateTime={props.formatDateTime}
          />,
        )}
      </SettingSheet>
    );
  }

  if (props.kind === "workspace") {
    return (
      <SettingSheet
        {...common}
        title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_WORKSPACE_TITLE")}
        description={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_WORKSPACE_DESC")}
      >
        {renderBody(
          <WorkspaceDetailsBody
            detail={props.query.detail!}
            formatDateTime={props.formatDateTime}
          />,
        )}
      </SettingSheet>
    );
  }

  return (
    <SettingSheet
      {...common}
      title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_PROJECT_TITLE")}
      description={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_PROJECT_DESC")}
    >
      {renderBody(
        <ProjectDetailsBody detail={props.query.detail!} formatDateTime={props.formatDateTime} />,
      )}
    </SettingSheet>
  );
}
