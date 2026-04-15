import {
  UserAvatar,
  WorkspaceAvatar,
  workspaceAvatarPropsFromIdentity,
} from "@/components/common/entity-avatar";
import { cn } from "@arclayer/lib/utils";

import type {
  UserCenterWorkspaceListItem,
  UserCenterWorkspacesTranslateFn,
  WorkspaceMenuItem,
} from "../types";
import type { WorkspaceEditingField } from "../hooks/use-workspace-menu-actions";
import { WorkspaceActionsDropdown } from "./workspace-actions-dropdown";
import { WorkspaceInlineNameEditor } from "./workspace-inline-name-editor";
import { WorkspaceMembersPopover } from "./workspace-members-popover";

const WORKSPACE_NAME_MAX_LENGTH = 128;
const WORKSPACE_DESCRIPTION_MAX_LENGTH = 256;

function normalizeWorkspaceDescriptionPreview(value?: string | null) {
  return (value ?? "").replace(/\s*[\r\n]+\s*/g, " ").trim();
}

interface WorkspaceCardProps {
  workspace: UserCenterWorkspaceListItem;
  menuItems: WorkspaceMenuItem[];
  t: UserCenterWorkspacesTranslateFn;
  editing: boolean;
  editingField: WorkspaceEditingField | null;
  editingName: string;
  editingDescription: string;
  onEditingNameChange: (value: string) => void;
  onEditingDescriptionChange: (value: string) => void;
  onCommitName: () => void;
  onCommitDescription: () => void;
  onCancelEdit: () => void;
  onClick?: () => void;
  className?: string;
}

export function WorkspaceCard({
  workspace,
  menuItems,
  t,
  editing,
  editingField,
  editingName,
  editingDescription,
  onEditingNameChange,
  onEditingDescriptionChange,
  onCommitName,
  onCommitDescription,
  onCancelEdit,
  onClick,
  className,
}: WorkspaceCardProps) {
  const descriptionPreview = normalizeWorkspaceDescriptionPreview(workspace.description);

  return (
    <div
      className={cn(
        "col-span-1 flex flex-col rounded-lg border border-border bg-card! p-4 !",
        "transition-colors! duration-200!",
        "hover:! hover:border-border/80! hover:bg-accent/50!",
        !editing && "cursor-pointer",
        className,
      )}
      onClick={editing ? undefined : onClick}
    >
      {/* Header: icon + action menu */}
      <div className="mb-4 flex flex-row justify-between">
        <div className="mr-4">
          <WorkspaceAvatar
            name={workspace.name}
            size={40}
            {...workspaceAvatarPropsFromIdentity(workspace)}
          />
        </div>
        <WorkspaceActionsDropdown menuItems={menuItems} />
      </div>

      {/* Title + description */}
      <div className="flex flex-col wrap-break-word" style={{ overflowWrap: "anywhere" }}>
        <WorkspaceInlineNameEditor
          editing={editing && editingField === "name"}
          value={workspace.name}
          draftValue={editingName}
          ariaLabel={t("common:ORG_WORKSPACES_RENAME_INPUT_LABEL")}
          maxLength={WORKSPACE_NAME_MAX_LENGTH}
          className="text-headline font-semibold"
          inputClassName="w-full text-headline font-semibold"
          onDraftChange={onEditingNameChange}
          onCommit={onCommitName}
          onCancel={onCancelEdit}
        />
        <WorkspaceInlineNameEditor
          editing={editing && editingField === "description"}
          value={descriptionPreview}
          draftValue={editingDescription}
          ariaLabel={t("common:ORG_WORKSPACES_DESCRIPTION_INPUT_LABEL")}
          maxLength={WORKSPACE_DESCRIPTION_MAX_LENGTH}
          emptyFallback={t("common:ORG_WORKSPACES_DESCRIPTION_FALLBACK")}
          className="text-footnote text-label-secondary line-clamp-2"
          containerClassName="mt-1"
          inputClassName="w-full text-footnote text-label-primary"
          onDraftChange={onEditingDescriptionChange}
          onCommit={onCommitDescription}
          onCancel={onCancelEdit}
        />
      </div>

      {/* Footer: member avatars + clickable count */}
      <div className="mt-auto flex items-center gap-2 pt-4">
        {workspace.membersPreview.length > 0 && (
          <div className="flex -space-x-2">
            {workspace.membersPreview.slice(0, 3).map((member) => (
              <UserAvatar
                key={member.userId}
                name={member.displayName || member.username || "U"}
                assetRef={member.avatarUrl}
                size={24}
              />
            ))}
            {workspace.membersPreview.length > 3 ? (
              <div className="inline-flex size-6 items-center justify-center rounded-full bg-primary text-caption font-semibold text-primary-foreground ring-2 ring-background">
                +{workspace.membersPreview.length - 3}
              </div>
            ) : null}
          </div>
        )}
        <div onClick={(e) => e.stopPropagation()}>
          <WorkspaceMembersPopover workspace={workspace} />
        </div>
      </div>
    </div>
  );
}
