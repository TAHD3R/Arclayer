import type * as Generated from "./generated/types.gen";

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

export type JsonValueInput = Generated.JsonValueInput;
export type JsonValueOutput = Generated.JsonValueOutput;

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

export type TokenPair = Generated.TokenPair & {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_expires_in?: number;
};
export type UserProfile = Generated.UserProfile & {
  display_name?: string | null;
  avatar_url?: string | null;
  avatar_asset_id?: string | null;
};
export type RegisterResult = Omit<Generated.RegisterResult, "requiresEmailVerification"> & {
  requiresEmailVerification?: boolean;
  requires_email_verification?: boolean;
  retry_after?: number | null;
};
export type RegisterEmailVerificationOut = Generated.RegisterEmailVerificationOut;
export type OnboardingProfile = Generated.OnboardingProfileOut & {
  job_role?: Generated.OnboardingProfileOut["jobRole"];
  company_size?: Generated.OnboardingProfileOut["companySize"];
  subscribed_product_updates?: Generated.OnboardingProfileOut["subscribedProductUpdates"];
  heard_about_us?: Generated.OnboardingProfileOut["heardAboutUs"];
};
export type UpdateMyProfilePayload = Generated.UpdateMyProfileRequest & {
  display_name?: string | null;
  avatarAssetId?: string | null;
  avatar_asset_id?: string | null;
};
export type PatchOnboardingProfilePayload = Omit<
  Generated.OnboardingProfilePatchRequest,
  "companySize" | "heardAboutUs" | "jobRole"
> & {
  companySize?: string | null;
  heardAboutUs?: string | null;
  jobRole?: string | null;
  job_role?: string | null;
  company_size?: string | null;
  subscribed_product_updates?: Generated.OnboardingProfilePatchRequest["subscribedProductUpdates"];
  heard_about_us?: string | null;
};
export type RequestMyEmailChangePayload = Omit<
  Generated.RequestMyEmailChangeRequest,
  "newEmail"
> & {
  newEmail?: string;
  new_email?: string;
};
export type RequestMyEmailChangeOut = Omit<Generated.RequestMyEmailChangeOut, "expiresIn"> & {
  expiresIn?: number;
  expires_in?: number;
  retry_after?: number;
};
export type ConfirmMyEmailChangePayload = Omit<
  Generated.ConfirmMyEmailChangeRequest,
  "newEmail"
> & {
  newEmail?: string;
  new_email?: string;
};
export type DeleteMyAccountReauthMethod = "password" | "2fa" | "relogin";
export type MySecurityCapability = Generated.MySecurityCapabilityOut & {
  has_password?: boolean;
  two_factor_enabled?: boolean;
  set_password_required_reauth_methods?: DeleteMyAccountReauthMethod[];
  email_change_required_reauth_methods?: DeleteMyAccountReauthMethod[];
  has_linked_oauth_identities?: boolean;
};
export type SetMyPasswordPayload = Omit<Generated.SetMyPasswordRequest, "newPassword"> & {
  newPassword?: string;
  new_password?: string;
  backup_code?: string | null;
};
export type RequestRemoveMyPasswordPayload = Omit<
  Generated.RequestRemoveMyPasswordRequest,
  "currentPassword"
> & {
  currentPassword?: string;
  current_password?: string;
};
export type ConfirmRemoveMyPasswordPayload = Generated.ConfirmRemoveMyPasswordRequest;
export type DeleteMyAccountPayload = Generated.DeleteMyAccountRequest & {
  backup_code?: string | null;
};
export type DeleteMyAccountCapability = Generated.DeleteMyAccountCapabilityOut;
export type ResetTokenPayload = Generated.ResetTokenPayload & {
  reset_token?: string;
  expires_in?: number;
};
export type EmailCheckOut = Generated.EmailCheckOut & {
  password_login_available?: boolean;
};
export type UsernameCheckOut = Generated.UsernameCheckOut;
export type LoginEmailCodeRequestOut = Generated.LoginEmailCodeRequestOut & {
  expires_in?: number;
  retry_after?: number;
};
export type RegisterPayload = Omit<Generated.RegisterRequest, "displayName" | "username"> & {
  displayName?: string;
  display_name?: string;
  username?: string;
};
export type TwoFactorChallengeMeta = {
  twoFactorToken: string;
  expiresIn: number;
  two_factor_token?: string;
  expires_in?: number;
};
export type TwoFactorReauthMethod = "password" | "relogin" | "totp" | "backup_code";
export type TwoFactorCapabilities = Generated.TwoFactorCapabilitiesOut & {
  can_setup?: boolean;
  setup_required_reauth_methods?: TwoFactorReauthMethod[];
  disable_required_reauth_methods?: TwoFactorReauthMethod[];
  regenerate_backup_codes_required_reauth_methods?: TwoFactorReauthMethod[];
  has_password?: boolean;
};
export type TwoFactorStatus = Generated.TwoFactorStatusOut & {
  backup_codes_remaining?: number;
};
export type TwoFactorSetupResult = Generated.TwoFactorSetupOut & {
  otpauth_uri?: string;
};
export type TwoFactorBackupCodesResult =
  | (Generated.TwoFactorConfirmOut & { backup_codes?: string[] })
  | (Generated.TwoFactorRegenerateBackupCodesOut & { backup_codes?: string[] });
export type AuthSessionRow = Generated.AuthSessionOut & {
  session_id?: string;
  issued_at?: string;
  last_used_at?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  device_label?: string | null;
  location_label?: string | null;
  auth_method?: string | null;
};
export type AuthSessionList = Omit<Generated.AuthSessionListOut, "items"> & {
  items: AuthSessionRow[];
};
export type AuthSessionRevokeOthersResult = Generated.AuthSessionRevokeOthersOut & {
  revoked_count?: number;
};

export type ActivityUserSummary = RequiredPresent<
  Generated.ActivityUserSummaryOut,
  "avatarUrl" | "displayName" | "username"
>;
export type ActivityEvent = Omit<Generated.AuditEventOut, "actor" | "subject"> & {
  actor?: ActivityUserSummary | null;
  subject?: ActivityUserSummary | null;
};
export type ListActivityParams = QueryOf<Generated.DomainWorkspacesListWorkspaceActivityData>;

export type BillingCycle = Generated.BillingCycle;
export type BillingRedirect = Generated.BillingRedirectOut;
export type CheckoutSessionCreate = Generated.CheckoutSessionCreate;
export type CommercialAccessMemberView = Generated.CommercialAccessMemberView;
export type CommercialAccessRecoveryView = Generated.CommercialAccessRecoveryView;
export type CommercialAccessState = Generated.CommercialAccessState;
export type CommercePlanRevision = Generated.CommercePlanRevisionOut;
export type CreditRefreshInterval = Generated.CreditRefreshInterval;
export type SubscriptionStatus = Generated.SubscriptionStatus;
export type WorkspacePlanOption = Generated.WorkspacePlanOptionOut;
export type WorkspacePlanCatalog = Generated.WorkspacePlanCatalogOut;
export type CreditLedgerEntryType = Generated.CreditLedgerEntryType;
export type CreditLedgerEntry = Generated.CreditLedgerOut;
export type WorkspaceCommerceOverview = Generated.WorkspaceCommerceOverviewOut;

export type FeedbackSource = Generated.FeedbackSource;
export type FeedbackContextType = Generated.FeedbackContextType;
export type FeedbackCategory = Generated.FeedbackCategory;
export type FeedbackIntent = Generated.FeedbackIntent;
export type FeedbackStatus = Generated.FeedbackStatus;
export type FeedbackPriority = Generated.FeedbackPriority;
export type FeedbackMessageKind = Generated.FeedbackMessageKind;
export type FeedbackUser = Generated.FeedbackUserOut;
export type FeedbackListItem = Generated.FeedbackTicketListItemOut;
export type FeedbackMessage = Generated.FeedbackMessageOut;
export type FeedbackDetail = Generated.FeedbackTicketDetailOut;
export type SubmitFeedbackPayload = Generated.FeedbackSubmitRequest;

export type SystemRuntime = Generated.SystemRuntimeOut;

export type MyWorkspace = Omit<
  Generated.MyWorkspaceOut,
  "id" | "memberCount" | "membersPreview"
> & {
  id?: string;
  memberCount: number;
  membersPreview: Generated.MyWorkspaceMemberPreviewOut[];
};
export type MyWorkspaceListResult = Omit<
  Generated.MyWorkspaceListResult,
  "items" | "onboarding"
> & {
  items?: MyWorkspace[];
  onboarding?: Generated.WorkspaceFirstOnboardingOut;
};
export type AuthzSnapshot = Generated.AuthzSnapshot;
export type ProjectAuthzSnapshot = Generated.ProjectAuthzSnapshot;
export type WorkspaceDetail = Generated.WorkspaceDetailOut;
export type WorkspaceSettingsDetail = Generated.WorkspaceSettingsDetail;
export type WorkspaceRolePolicy = Generated.WorkspaceRolePolicyOut;
export type WorkspaceAssignRoleResult = Generated.WorkspaceAssignRoleToMembersResult;
export type OnboardingWorkspaceCreatePayload = Generated.OnboardingWorkspaceCreateRequest;
export type OnboardingWorkspaceCreateResult = Generated.OnboardingWorkspaceCreateOut & {
  workspace_id?: string;
};
export type LeaveWorkspaceResult = Generated.LeaveWorkspaceResult;
export type WorkspaceDeleteResult = Generated.WorkspaceDeleteResult;
export type WorkspaceDangerCapabilities = Generated.WorkspaceDangerCapabilitiesOut;
export type WorkspaceIconMode = Generated.WorkspaceIconMode;
export type WorkspaceIconMetadata = {
  iconMode: WorkspaceIconMode;
  iconColor: string;
  iconGlyph?: string | null;
  iconEmoji?: string | null;
  iconUrl?: string | null;
};
export type AdminWorkspaceSite = Generated.ProjectRuntimeSiteOut;
export type CreateAdminSitePreviewTokenPayload = Generated.SitePreviewTokenCreateIn;
export type AdminSitePreviewToken = Generated.SitePreviewTokenOut;
export type ProjectApiKeyCreateIn = Generated.ProjectApiKeyCreateIn;

export type Project = Generated.ProjectOut & {
  description: string | null;
  iconMode: WorkspaceIconMode;
  iconColor: string;
  iconUrl: string | null;
  isActive: boolean;
};
export type ProjectRuntime = Generated.ProjectRuntimeOut;
export type ProjectListItem = Omit<
  Generated.ProjectListItemOut,
  | "archivedAt"
  | "archivedByUserId"
  | "description"
  | "enterable"
  | "iconColor"
  | "iconMode"
  | "iconUrl"
  | "memberCount"
  | "membersPreview"
  | "primaryRuntime"
> & {
  archivedAt: string | null;
  archivedByUserId: string | null;
  description: string | null;
  enterable: boolean;
  iconColor: string;
  iconMode: WorkspaceIconMode;
  iconUrl: string | null;
  memberCount: number;
  membersPreview: Array<
    Omit<Generated.ProjectMemberPreviewOut, "avatarUrl" | "displayName" | "email"> & {
      avatarUrl: string | null;
      displayName: string | null;
      email: string | null;
    }
  >;
  primaryRuntime: ProjectRuntime | null;
  updatedAt: string;
};
export type ProjectCreateInput = Generated.ProjectCreateRequest;
export type ProjectUpdateInput = Generated.ProjectUpdateRequest;
export type ProjectSlugAvailability = Omit<
  Generated.ProjectSlugAvailabilityOut,
  "available" | "normalizedSlug" | "reason"
> & {
  available: boolean;
  normalizedSlug: string | null;
  reason: "invalid" | "reserved" | "exists" | null;
};
export type ProjectDangerAction = Generated.ProjectDangerActionOut;
export type ProjectDangerCapabilities = Generated.ProjectDangerCapabilitiesOut;
export type ProjectArchiveResult = Generated.ProjectArchiveResult;
export type ProjectDeleteResult = Generated.ProjectDeleteResult;
export type ProjectDetail = Omit<Generated.ProjectDetailOut, "primaryRuntime" | "project"> & {
  primaryRuntime: ProjectRuntime | null;
  project: Project;
};
export type ProjectMember = Generated.ProjectMemberOut;
export type ProjectMemberRole = Generated.ProjectMemberRole;

export type OrgUserStatus = Generated.UserStatus;
export type WorkspaceManageListItem = Generated.WorkspaceManageListItemOut;
export type WorkspaceManageCreateInput = Generated.WorkspaceManageCreateRequest;
export type WorkspaceManageArchiveResult = Generated.WorkspaceManageArchiveResult;
export type WorkspaceManageMember = TeamMember;
export type WorkspaceManageTemplate = Generated.WorkspaceManageTemplate;
export type ProjectPermissionAction = Generated.ProjectPermissionActionOut;
export type ProjectSettingsDetail = Generated.ProjectSettingsDetail;
export type ProjectSettingsPatch = Generated.ProjectSettingsPatch;
export type ProjectSourceFileDelete = Generated.ProjectSourceFileDeleteOut;
export type ProjectSourceFile = Generated.ProjectSourceFileOut;
export type ProjectSourceFileUpsertInput = Generated.ProjectSourceFileUpsertIn;
export type ProjectSourceManifest = Generated.ProjectSourceManifestOut;
export type WorkspacePermissionAction = Omit<
  Generated.WorkspacePermissionActionOut,
  "permissionCodes" | "subjectKinds"
> & {
  permissionCodes: string[];
  subjectKinds: string[];
};
export type RolePermissionGrant = Omit<Generated.RolePermissionGrantOut, "conditionSets"> & {
  conditionSets: Generated.PermissionConditionSetOutput[];
};

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
export type ListAdminAssetsParams = QueryOf<Generated.DomainProjectsListAssetsData> & {
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
export type AdminContentModelKind = NonNullable<Generated.ContentModelOut["modelKind"]>;
export type AdminContentModelFieldScalar = Generated.ContentModelFieldContract["scalar"];
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
export type AdminContentModelRelationKind =
  | "one_to_one"
  | "one_to_many"
  | "many_to_one"
  | "many_to_many"
  | "one_way"
  | "many_way"
  | "morph_to_one"
  | "morph_to_many"
  | "morph_one"
  | "morph_many";
export type AdminContentModelRelationContract = Omit<
  Generated.ContentModelRelationContract,
  "relation"
> & {
  relation: AdminContentModelRelationKind;
};
export type CreateAdminContentModelPayload = Omit<
  Generated.ContentModelDefinitionContract,
  "relations"
> & {
  relations?: AdminContentModelRelationContract[];
};
export type CreateAdminContentModelFieldPayload = Generated.ContentModelFieldContract;
export type PatchAdminContentModelFieldPayload = Generated.ContentModelFieldPatchContract;
export type ReorderAdminContentModelFieldsPayload = Generated.ContentModelFieldReorderContract;
export type AdminContentModelJsonPreview = Generated.ContentModelSchemaSnapshotOut;
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
export type AdminContentTranslationStatus = Generated.ContentTranslationStatusOut;
export type AdminContentTranslationGroup = Omit<Generated.ContentTranslationGroupOut, "items"> & {
  items: AdminContentItem[];
};
export type CreateAdminContentTranslationPayload = Generated.ContentTranslationCreateIn;
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
export type AdminContentRouteBinding = Generated.RouteBindingOut;
export type UpsertAdminContentRouteBindingPayload = Generated.RouteBindingUpsertIn;
export type AdminContentHierarchyNode = Generated.HierarchyNodeOut;
export type UpsertAdminContentHierarchyNodePayload = Generated.HierarchyNodeUpsertIn;
export type AdminContentComponentBinding = Generated.ContentComponentBindingOut;
export type AdminContentComponentBindingList = Generated.ContentComponentBindingListOut;
export type AdminContentSeoProfile = Generated.ContentSeoProfileOut;
export type AdminPublishImpact = RequiredDefined<
  Generated.PublishReadinessOut,
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
  createdByUserId?: string;
  editWith?: AdminContentLibraryViewEditWith;
  tag?: string;
  locale?: string;
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
export type UploadPurposePolicy = Omit<Generated.UploadPolicyOut, "purpose">;
export type UploadPolicySettings = {
  defaults: UploadPurposePolicy;
  purposes: Record<string, UploadPurposePolicy>;
};
export type UploadPolicyOut = Generated.UploadPolicyOut;
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
export type WorkspacePermissionCatalog = Generated.WorkspacePermissionCatalogOut;
export type WorkspacePermissionGroup = Generated.WorkspacePermissionGroupOut;
export type WorkspacePermissionConditionTemplate =
  Generated.WorkspacePermissionConditionTemplateOut;
export type PermissionCondition = Generated.PermissionCondition;
export type PermissionConditionSet = Generated.PermissionConditionSetInput;
export type PermissionConditionField = Generated.PermissionConditionField;
export type PermissionConditionOperator = Generated.PermissionConditionOperator;
export type RolePermissionBatchSetRequest = Generated.RolePermissionBatchSetRequest;
export type RolePermissionBatchSetOut = Generated.RolePermissionBatchSetOut;
