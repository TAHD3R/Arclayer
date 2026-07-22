import { api } from "@/lib/http";
import { toQueryString } from "@/lib/api";
import type {
  CreateFeedbackMessagePayload,
  FeedbackCategory,
  FeedbackDetail,
  FeedbackIntent,
  FeedbackListItem,
  FeedbackOrdering,
  FeedbackPriority,
  FeedbackSource,
  FeedbackStatus,
  PageData,
  SubmitFeedbackPayload,
  UpdateFeedbackPayload,
} from "@arclayer/openapi/admin-types";

export type {
  CreateFeedbackMessagePayload,
  FeedbackCategory,
  FeedbackContextType,
  FeedbackDetail,
  FeedbackIntent,
  FeedbackListItem,
  FeedbackMessage,
  FeedbackMessageKind,
  FeedbackPriority,
  FeedbackOrdering,
  FeedbackSource,
  FeedbackStatus,
  FeedbackUser,
  SubmitFeedbackPayload,
  UpdateFeedbackPayload,
} from "@arclayer/openapi/admin-types";

export type FeedbackPage = PageData<FeedbackListItem>;

export type ListSystemFeedbackParams = {
  status?: FeedbackStatus;
  priority?: FeedbackPriority;
  source?: FeedbackSource;
  intent?: FeedbackIntent;
  legacyCategory?: FeedbackCategory;
  workspaceId?: string;
  projectId?: string;
  assigneeUserId?: string;
  reporterUserId?: string;
  createdFrom?: string;
  createdTo?: string;
  activityFrom?: string;
  activityTo?: string;
  ordering?: FeedbackOrdering;
  search?: string;
  page?: number;
  size?: number;
};

export async function submitFeedback(payload: SubmitFeedbackPayload): Promise<FeedbackDetail> {
  return api.post<FeedbackDetail>("/feedback", payload);
}

export async function listSystemFeedback(
  params: ListSystemFeedbackParams = {},
): Promise<FeedbackPage> {
  return api.get<FeedbackPage>(
    `/system/feedback${toQueryString({
      status: params.status,
      priority: params.priority,
      source: params.source,
      intent: params.intent,
      legacyCategory: params.legacyCategory,
      workspaceId: params.workspaceId,
      projectId: params.projectId,
      assigneeUserId: params.assigneeUserId,
      reporterUserId: params.reporterUserId,
      createdFrom: params.createdFrom,
      createdTo: params.createdTo,
      activityFrom: params.activityFrom,
      activityTo: params.activityTo,
      ordering: params.ordering,
      search: params.search,
      page: params.page ?? 1,
      size: params.size ?? 20,
    })}`,
  );
}

export async function getSystemFeedback(feedbackId: string): Promise<FeedbackDetail> {
  return api.get<FeedbackDetail>(`/system/feedback/${encodeURIComponent(feedbackId)}`);
}

export async function updateSystemFeedback(
  feedbackId: string,
  payload: UpdateFeedbackPayload,
): Promise<FeedbackDetail> {
  return api.patch<FeedbackDetail>(`/system/feedback/${encodeURIComponent(feedbackId)}`, payload);
}

export async function addSystemFeedbackMessage(
  feedbackId: string,
  payload: CreateFeedbackMessagePayload,
): Promise<FeedbackDetail> {
  return api.post<FeedbackDetail>(
    `/system/feedback/${encodeURIComponent(feedbackId)}/messages`,
    payload,
  );
}
