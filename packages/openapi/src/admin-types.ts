import type * as Generated from "./generated";

type QueryOf<T> = T extends { query?: infer Q } ? NonNullable<Q> : never;
type RequiredDefined<T, K extends keyof T> = Omit<T, K> & {
  [P in K]-?: NonNullable<T[P]>;
};
type RequiredPresent<T, K extends keyof T> = Omit<T, K> & {
  [P in K]-?: Exclude<T[P], undefined>;
};

export type PageData<T> = {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
  next?: number | null;
  prev?: number | null;
};

export type AcceptExistingInvitationResult = Generated.AcceptExistingInvitationResult;

export type AuthSSOProvider = Generated.AuthSsoProviderItem & {
  start_url?: string;
  icon_key?: string | null;
};

export type AuthSSOProvidersOut = Omit<Generated.AuthSsoProvidersOut, "providers"> & {
  providers: AuthSSOProvider[];
};

export type AuthSSOLinkStateOut = Omit<Generated.AuthSsoLinkStateOut, "expiresIn"> & {
  expiresIn?: number;
  expires_in?: number;
};

export type OAuthLinkedIdentityListOut = Generated.OAuthLinkedIdentityListOut;

export type ActivityUserSummary = RequiredPresent<
  Generated.ActivityUserSummaryOut,
  "avatarUrl" | "displayName" | "username"
>;
export type ActivityEvent = Omit<Generated.AuditEventOut, "actor" | "subject"> & {
  actor?: ActivityUserSummary | null;
  subject?: ActivityUserSummary | null;
};
export type ListActivityParams = QueryOf<Generated.InternalSystemListActivityData>;

export type SystemRuntime = Generated.SystemRuntimeOut;

export type SettingsDetail = Generated.SettingsDetail;
export type SettingsOptionItem = Generated.SettingsOptionItem;
export type SettingsSchemaItem = Generated.SettingsSchemaItem;
export type SystemSettingsDetail = Generated.SettingsDetail;
export type SysStepUpResult = {
  token: string;
  expiresIn: number;
};
export type SysConfigNamespaceSummary = {
  namespace: string;
  kind: "core" | string;
  title: string;
  description?: string | null;
};
export type SysConfigDetail = {
  namespace: string;
  settingSchema: SettingsSchemaItem;
  value: Record<string, unknown>;
  secrets: Record<string, boolean>;
  activeRevisionId?: string | null;
  revisionId?: string | null;
  updatedAt?: string | null;
};
export type SysConfigPatchPayload = {
  patch: Record<string, unknown>;
  activate?: boolean;
};
export type SysConfigActivatePayload = {
  revisionId: string;
};
export type SysConfigRevisionOut = {
  id: string;
  createdAt: string;
  updatedAt: string;
  namespace: string;
  baseRevisionId?: string | null;
  createdBy?: string | null;
  signature?: string | null;
  signingKeyFingerprint?: string | null;
};
export type SysConfigRevisionDetail = SysConfigRevisionOut & {
  signatureVerified?: boolean | null;
  signatureVerifyReason?: string | null;
  value: Record<string, unknown>;
  secrets: Record<string, boolean>;
};
export type SysConfigTestCheck = {
  code: string;
  ok: boolean;
  kind: "config" | "connectivity" | "internal" | string;
  message?: string | null;
  details?: Record<string, unknown> | null;
};
export type SysConfigTestResult = {
  ok: boolean;
  checks: SysConfigTestCheck[];
};
export type ListSysConfigNamespacesOut = PageData<SysConfigNamespaceSummary>;
export type ListSysConfigRevisionsOut = PageData<SysConfigRevisionOut>;

export type MyOrganization = Generated.MyOrganizationOut;
export type MyOrganizationListResult = Generated.MyOrganizationListOut;
export type CreateMyOrganizationInput = Generated.CreateMyOrganizationRequest;
export type MyWorkspace = Omit<
  Generated.MyWorkspaceOut,
  "id" | "memberCount" | "membersPreview"
> & {
  id?: string;
  memberCount: number;
  membersPreview: Generated.MyWorkspaceMemberPreviewOut[];
};
export type MyWorkspaceListResult = Omit<Generated.MyWorkspaceListResult, "items"> & {
  items: MyWorkspace[];
};
export type AuthzSnapshot = Generated.AuthzSnapshot;
export type ProjectAuthzSnapshot = Generated.ProjectAuthzSnapshot;
export type WorkspaceDetail = Generated.WorkspaceDetailOut;
export type WorkspaceRolePolicy = Generated.WorkspaceRolePolicyOut;
export type WorkspaceAssignRoleResult = Generated.WorkspaceAssignRoleToMembersResult;
export type LeaveWorkspaceResult = Generated.LeaveWorkspaceResult;
export type WorkspaceDeleteResult = Generated.WorkspaceDeleteResult;
export type WorkspaceDangerCapabilities = Generated.WorkspaceDangerCapabilitiesOut;
export type AdminWorkspaceSite = Generated.ProjectRuntimeSiteOut;
export type CreateAdminSitePreviewTokenPayload = Generated.SitePreviewTokenCreateIn;
export type AdminSitePreviewToken = Generated.SitePreviewTokenOut;
export type ProjectApiKeyCreateIn = Generated.ProjectApiKeyCreateIn;

export type OrganizationSettingsCore = Generated.OrganizationSettingsCoreOut;
export type OrganizationAssignDefaultRoleResult = Generated.OrganizationAssignDefaultRoleResult;
export type OrganizationDangerCapabilities = Generated.OrganizationDangerCapabilitiesOut;
export type DeleteOrganizationResult = Generated.DeleteOrganizationResult;
export type LeaveOrganizationResult = Generated.LeaveOrganizationResult;
export type OrgRole = Generated.OrgRole;
export type OrgMembershipStatus = Generated.OrganizationMemberOut["status"];
export type OrgUserStatus = Generated.UserStatus;
export type OrganizationWorkspace = Omit<
  Generated.OrganizationWorkspaceOut,
  "memberCount" | "membersPreview"
> & {
  memberCount: number;
  membersPreview: Generated.OrganizationWorkspaceMemberPreviewOut[];
};
export type OrganizationWorkspaceArchiveResult = Generated.OrganizationWorkspaceArchiveResult;
export type OrganizationWorkspaceCreateInput = Generated.OrganizationWorkspaceCreateRequest;
export type OrganizationWorkspaceMember = Generated.OrganizationWorkspaceMemberOut;
export type OrganizationInvitation = Generated.OrganizationInvitationOut;
export type OrganizationInvitationListParams =
  QueryOf<Generated.DomainOrganizationListOrganizationInvitationsData>;
export type OrganizationInviteLink = Generated.OrganizationInviteLinkOut;
type OrganizationUserRef = RequiredPresent<
  Generated.OrganizationInvitationUserRefOut,
  "avatarUrl" | "displayName" | "email"
>;
export type OrganizationInviteLinkParticipant = Omit<
  Generated.OrganizationInviteLinkParticipantOut,
  "user"
> & {
  user: OrganizationUserRef;
};
export type OrganizationInviteResult = Generated.OrganizationMemberInviteResult;
export type OrganizationMember = Generated.OrganizationMemberOut;
export type OrganizationMemberListParams =
  QueryOf<Generated.DomainOrganizationListOrganizationMembersData>;
export type OrganizationPermission = Generated.OrganizationPermissionOut;
export type OrganizationRole = Generated.OrganizationRoleOut;
export type ProjectPermissionAction = Generated.ProjectPermissionActionOut;
export type ProjectSettingsDetail = Generated.ProjectSettingsDetail;
export type ProjectSettingsPatch = Generated.ProjectSettingsPatch;

export type AdminAssetSummary = Generated.AdminAssetSummaryOut;
export type AdminAssetFolder = Generated.AdminAssetFolderOut;
export type AdminAssetTag = Generated.AdminAssetTagOut;
export type AdminAssetDetail = Omit<Generated.AdminAssetDetailOut, "tags"> & {
  tags: Generated.AdminAssetTagOut[];
};
export type PatchAdminAssetPayload = Omit<
  Generated.AdminAssetUpdateRequest,
  "indexable" | "purpose" | "visibility"
> & {
  indexable?: boolean;
  purpose?: string | null;
  visibility?: string | null;
};
export type ListAdminAssetsParams = QueryOf<Generated.DomainWorkspacesListAssetsData> & {
  tagIds?: string[] | null;
};
export type AdminAssetFolderCreateRequest = Generated.AdminAssetFolderCreateRequest;
export type AdminAssetFolderUpdateRequest = Generated.AdminAssetFolderUpdateRequest;
export type AdminAssetFolderDeleteRequest = Generated.AdminAssetFolderDeleteRequest;
export type AdminAssetFolderDeleteOut = Generated.AdminAssetFolderDeleteOut;
export type AdminAssetDeleteOut = Generated.AdminAssetDeleteOut;
export type AdminAssetMoveRequest = Generated.AdminAssetMoveRequest;
export type AdminAssetsBulkMoveRequest = Generated.AdminAssetBulkMoveRequest;
export type AdminAssetsBulkMoveOut = Omit<Generated.AdminAssetBulkMoveOut, "movedAssetIds"> & {
  movedAssetIds: string[];
};
export type AdminAssetsBulkDeleteRequest = Generated.AdminAssetBulkDeleteRequest;
export type AdminAssetsBulkDeleteOut = Omit<
  Generated.AdminAssetBulkDeleteOut,
  "deletedAssetIds"
> & {
  deletedAssetIds: string[];
};
export type AdminAssetsBulkUpdateRequest = Omit<
  Generated.AdminAssetBulkUpdateRequest,
  "indexable" | "purpose" | "visibility"
> & {
  indexable?: boolean;
  purpose?: string | null;
  visibility?: string | null;
};
export type AdminAssetsBulkUpdateOut = Omit<
  Generated.AdminAssetBulkUpdateOut,
  "indexable" | "purpose" | "updatedAssetIds" | "visibility"
> & {
  indexable?: boolean;
  purpose?: string | null;
  updatedAssetIds: string[];
  visibility?: string | null;
};
export type AdminAssetUsage = Generated.AdminAssetUsageOut;
export type UpsertAdminAssetUsagePayload = Generated.AdminAssetUsageUpsertRequest;

export type AdminContentModelCategory = NonNullable<Generated.ContentModelOut["category"]>;
export type AdminContentModelCapability = NonNullable<
  Generated.ContentModelOut["capabilities"]
>[number];
export type AdminContentContinuationRole = NonNullable<Generated.ContentModelOut["defaultRole"]>;
export type AdminContentContinuationPosture = NonNullable<
  Generated.ContentModelOut["defaultPosture"]
>;
export type AdminContentContinuationSurface = NonNullable<
  Generated.ContentModelOut["defaultSurface"]
>;
export type AdminContentWorkbenchDerivedStatus = NonNullable<
  Generated.ContentItemOut["derivedStatus"]
>;
export type AdminContentWorkbenchRuntime = NonNullable<Generated.ContentItemOut["runtime"]>;
export type AdminContentWorkbenchContext = NonNullable<Generated.ContentItemOut["context"]>;
export type AdminContentWorkbenchLibraryGroup = NonNullable<
  Generated.ContentItemOut["libraryGroup"]
>;
export type AdminContentShapeReasonCode = NonNullable<Generated.ContentOpenIntentOut["reasonCode"]>;
export type AdminContentRecoveryAction = Generated.ContentRecoveryActionOut;
export type AdminContentOpenIntent = Generated.ContentOpenIntentOut;
export type AdminContentModel = Omit<Generated.ContentModelOut, "capabilities"> & {
  capabilities: NonNullable<Generated.ContentModelOut["capabilities"]>;
};
type AdminContentModelImpact = RequiredDefined<
  Generated.ContentModelImpactOut,
  "breakingChanges" | "hasBreakingChanges" | "warnings"
>;
export type AdminContentModelImpactPreview = Omit<
  Generated.ContentModelImpactPreviewOut,
  | "affectedItemsCount"
  | "hasBlockingChanges"
  | "impact"
  | "recoveryItemsCount"
  | "reshapeItemsCount"
> & {
  affectedItemsCount: number;
  hasBlockingChanges: boolean;
  impact: AdminContentModelImpact;
  recoveryItemsCount: number;
  reshapeItemsCount: number;
};
export type AdminContentItemStatus = NonNullable<Generated.ContentItemOut["status"]>;
export type AdminContentItemVisibility = NonNullable<Generated.ContentItemOut["visibility"]>;
export type AdminContentShapeState = NonNullable<Generated.ContentItemOut["shapeState"]>;
export type AdminContentWorkflowStage = NonNullable<Generated.ContentItemOut["workflowStage"]>;
export type AdminContentItemWorkflowNote = Generated.ContentItemWorkflowNoteOut;
export type AdminContentItemPublishReadiness = Generated.ContentItemPublishReadinessOut;
export type PatchAdminContentItemWorkflowPayload = Generated.ContentItemWorkflowPatchIn;
export type AdminContentBootstrapPresetState = NonNullable<
  Generated.ContentItemBootstrapShapeIn["presetState"]
>;
export type AdminContentVersionState = NonNullable<Generated.ContentVersionOut["state"]>;
export type AdminContentPresentationKind = Generated.ContentPresentationOut["kind"];
export type AdminContentCapabilityPackId = NonNullable<
  Generated.ContentItemBootstrapShapeIn["capabilityPackIds"]
>[number];
export type AdminContentItem = Omit<
  Generated.ContentItemOut,
  "capabilityPackIds" | "derivedStatus" | "draftVersion"
> & {
  capabilityPackIds: string[];
  derivedStatus: NonNullable<Generated.ContentItemOut["derivedStatus"]>;
  draftVersion: number;
};
export type CreateAdminContentItemPayload = Generated.ContentItemCreateIn;
export type ApplyAdminContentBootstrapShapePayload = Generated.ContentItemBootstrapShapeIn;
export type AdminContentPresentation = Generated.ContentPresentationOut;
export type AdminContentVersion = Omit<
  Generated.ContentVersionOut,
  "fieldsSnapshot" | "presentations"
> & {
  fieldsSnapshot: Exclude<Generated.ContentVersionOut["fieldsSnapshot"], undefined>;
  presentations: NonNullable<Generated.ContentVersionOut["presentations"]>;
};
export type SaveAdminContentDraftVersionPayload = Generated.ContentVersionDraftSaveIn;
export type PatchAdminContentVersionPayload = Generated.ContentVersionPatchIn;
export type AdminContentSeoProfile = Generated.ContentSeoProfileOut;
export type AdminPublishImpact = RequiredDefined<
  Generated.PublishImpactOut,
  | "blockedItems"
  | "missingRoutes"
  | "readinessSummary"
  | "unpublishedDependencies"
  | "unresolvedRelations"
>;
export type AdminPublishReadinessSummary = Generated.PublishReadinessSummaryOut;
export type AdminRelease = Generated.ReleaseOut;
export type AdminReleaseList = Generated.ReleaseListOut;
export type AdminReleasePublishResult = Generated.ReleasePublishOut;
export type AdminReleaseRollbackResult = Generated.ReleaseRollbackOut;
export type AdminReleaseDryRun = Generated.ReleaseDryRunOut;
export type AdminAutomationCatalog = Generated.AutomationCatalogOut;
export type AdminAutomationTrigger = Generated.AutomationTriggerOut;
export type AdminAutomationOperationKind = Generated.AutomationOperationKindOut;
export type AdminAutomationOperationInput = Generated.AutomationOperationIn;
export type AdminAutomationOperation = Generated.AutomationOperationOut;
export type AdminAutomationFlow = Omit<Generated.AutomationFlowOut, "operations"> & {
  operations: Generated.AutomationOperationOut[];
};
export type AdminAutomationFlowList = Omit<Generated.AutomationFlowListOut, "items"> & {
  items: AdminAutomationFlow[];
};
export type CreateAdminAutomationFlowPayload = Generated.AutomationFlowCreateIn;
export type PatchAdminAutomationFlowPayload = Generated.AutomationFlowPatchIn;
export type AdminAutomationRunLog = Generated.AutomationRunLogOut;
export type AdminAutomationRun = Omit<Generated.AutomationRunOut, "logs"> & {
  logs: Generated.AutomationRunLogOut[];
};
export type AdminAutomationRunList = Omit<Generated.AutomationRunListOut, "items"> & {
  items: AdminAutomationRun[];
};
export type AdminAutomationFlowStatus = Generated.AutomationFlowStatus;
export type AdminAutomationOperationKindValue = Generated.AutomationOperationKind;
export type AdminAutomationRunStatus = Generated.AutomationRunStatus;
export type AdminAutomationTriggerKind = Generated.AutomationTriggerKind;
export type ListAdminContentModelsParams =
  QueryOf<Generated.DomainProjectsListProjectContentModelsData>;
export type ListAdminContentItemsParams =
  QueryOf<Generated.DomainProjectsListProjectContentItemsData>;
export type ListAdminContentVersionsParams =
  QueryOf<Generated.DomainProjectsListProjectContentItemVersionsData>;
export type AdminContentLibraryViewStatus = NonNullable<
  Generated.ContentLibraryViewFiltersSchema["status"]
>;
export type AdminContentLibraryViewRole = NonNullable<
  Generated.ContentLibraryViewFiltersSchema["role"]
>;
export type AdminContentLibraryViewEditWith = NonNullable<
  Generated.ContentLibraryViewFiltersSchema["editWith"]
>;
export type AdminContentLibraryViewVisibility = Generated.ContentLibraryViewOut["visibility"];
export type AdminContentLibraryViewFilters = {
  editWith?: AdminContentLibraryViewEditWith;
  modelKey?: string;
  role?: AdminContentLibraryViewRole;
  status?: AdminContentLibraryViewStatus;
};
export type AdminContentLibraryViewSorting = Omit<
  Generated.ContentLibraryViewSortingItemSchema,
  "desc"
> & {
  desc: boolean;
};
export type AdminContentLibraryViewMode = NonNullable<Generated.ContentLibraryViewOut["viewMode"]>;
export type AdminContentLibraryViewRowHeight = NonNullable<
  Generated.ContentLibraryViewColumnsSchema["rowHeight"]
>;
export type AdminContentLibraryViewColumns = {
  order?: string[];
  rowHeight?: AdminContentLibraryViewRowHeight;
  visibility?: Record<string, boolean>;
  wrapHeaders?: boolean;
};
export type AdminContentLibrarySystemViewId = Generated.ContentLibraryViewOut["baseViewId"];
export type AdminContentLibraryView = Omit<
  Generated.ContentLibraryViewOut,
  "columns" | "filters" | "sorting"
> & {
  columns?: AdminContentLibraryViewColumns;
  filters: AdminContentLibraryViewFilters;
  sorting: AdminContentLibraryViewSorting[];
};
export type AdminContentLibraryViewsState = Omit<Generated.ContentLibraryViewsStateOut, "items"> & {
  items: AdminContentLibraryView[];
};
export type CreateAdminContentLibraryViewPayload = Omit<
  Generated.ContentLibraryViewCreateIn,
  "columns" | "filters" | "sorting"
> & {
  columns?: AdminContentLibraryViewColumns;
  filters?: AdminContentLibraryViewFilters;
  sorting?: AdminContentLibraryViewSorting[];
};
export type PatchAdminContentLibraryViewPayload = Omit<
  Generated.ContentLibraryViewPatchIn,
  "columns" | "filters" | "sorting"
> & {
  columns?: AdminContentLibraryViewColumns;
  filters?: AdminContentLibraryViewFilters;
  sorting?: AdminContentLibraryViewSorting[];
};
export type MoveAdminContentLibraryViewPayload = Generated.ContentLibraryViewMoveIn;
export type PatchAdminContentModelPayload = Generated.ContentModelDefinitionPatchContract;

export type UploadAbortOut = Generated.UploadAbortOut;
export type UploadCompleteOut = Generated.UploadCompleteOut;
export type UploadInitOut = Generated.UploadInitOut;
export type UploadInitRequest = Generated.UploadInitRequest;
export type AvatarUploadInitRequest = Generated.AvatarUploadInitRequest;
export type UploadPartCommitRequest = Generated.UploadPartCommitRequest;
export type UploadPartPresignOut = Generated.UploadPartPresignOut;
export type UploadStatusOut = Generated.UploadStatusOut;

export type InvitationPreviewResult = Generated.InvitationPreviewResult;
export type MyInvitation = Generated.MyInvitationOut;

export type NotificationCategory = Generated.NotificationCategory;
export type NotificationItem = Generated.NotificationOut;
export type ListNotificationsParams = QueryOf<Generated.DomainWorkspacesListMyNotificationsData>;
export type NotificationPreview = Omit<Generated.NotificationPreviewOut, "items"> & {
  items: NotificationItem[];
};
export type NotificationPreferenceChannel = "in_app" | "email";
export type NotificationPreferenceTopic = Omit<
  Generated.NotificationPreferenceTopicOut,
  "channels" | "descriptionI18N" | "titleI18N"
> & {
  channels: Record<NotificationPreferenceChannel, Generated.NotificationPreferenceChannelOut>;
  descriptionI18N?: string;
  descriptionI18n?: string;
  description_i18n?: string;
  titleI18N?: string;
  titleI18n?: string;
  title_i18n?: string;
};
export type NotificationPreferences = {
  topics: NotificationPreferenceTopic[];
};

export type MembershipStatus = Generated.WorkspaceMembershipStatus;
export type UserStatus = Generated.UserStatus;
export type TeamMember = RequiredPresent<
  Omit<Generated.WorkspaceTeamMemberOut, "roleCodes">,
  "avatarUrl" | "displayName" | "email" | "lastLoginAt"
> & {
  roleCodes: string[];
};
export type TeamUserOption = Generated.WorkspaceTeamUserOptionOut;
export type ListTeamMembersParams = QueryOf<Generated.DomainWorkspacesListMembersData>;
export type TeamUserRef = RequiredPresent<
  Generated.WorkspaceTeamUserRefOut,
  "avatarUrl" | "displayName" | "email"
>;
export type TeamInvitation = Omit<Generated.WorkspaceEmailInviteOut, "acceptedBy" | "createdBy"> & {
  acceptedBy: TeamUserRef | null;
  createdBy: TeamUserRef | null;
};
export type TeamInvitationCreateResult = Generated.WorkspaceEmailInviteCreateResult;
export type ListTeamInvitationsParams = QueryOf<Generated.DomainWorkspacesListEmailInvitesData>;
export type TeamInviteLink = Omit<
  Generated.WorkspaceInviteLinkOut,
  "createdBy" | "lastUsedBy" | "recentParticipants"
> & {
  createdBy: TeamUserRef | null;
  lastUsedBy: TeamUserRef | null;
  recentParticipants: TeamInviteLinkParticipant[];
};
export type TeamInviteLinkCreateResult = Generated.WorkspaceInviteLinkCreateResult;
export type ListTeamInviteLinksParams = QueryOf<Generated.DomainWorkspacesListInviteLinksData>;
export type TeamInviteLinkParticipant = Omit<
  Generated.WorkspaceInviteLinkParticipantOut,
  "user"
> & {
  user: TeamUserRef;
};
export type ListTeamInviteLinkParticipantsParams =
  QueryOf<Generated.DomainWorkspacesListInviteLinkParticipantsData>;

export type Permission = Generated.WorkspacePermissionOut;
export type Role = RequiredPresent<Generated.WorkspaceRoleOut, "description" | "permissionCodes">;
