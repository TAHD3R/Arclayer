import { api } from "@/lib/http";
import { toQueryString } from "@/lib/api";
import type {
  CreateFeedbackMessagePayload,
  FeedbackCategory,
  FeedbackDetail,
  FeedbackListItem,
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
  FeedbackListItem,
  FeedbackMessage,
  FeedbackMessageKind,
  FeedbackPriority,
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
  category?: FeedbackCategory;
  workspaceId?: string;
  assigneeUserId?: string;
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
      category: params.category,
      workspaceId: params.workspaceId,
      assigneeUserId: params.assigneeUserId,
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
