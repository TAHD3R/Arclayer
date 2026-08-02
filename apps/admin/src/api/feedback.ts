import { api } from "@/lib/http";
import type {
  FeedbackTicketDetailOut as FeedbackDetail,
  FeedbackSubmitRequest as SubmitFeedbackPayload,
} from "@arclayer/openapi";

export type {
  FeedbackContextType,
  FeedbackTicketDetailOut as FeedbackDetail,
  FeedbackIntent,
  FeedbackSource,
  FeedbackSubmitRequest as SubmitFeedbackPayload,
} from "@arclayer/openapi";

export async function submitFeedback(payload: SubmitFeedbackPayload): Promise<FeedbackDetail> {
  return api.post<FeedbackDetail>("/feedback", payload);
}

export async function getMyFeedbackDetail(ticketId: string): Promise<FeedbackDetail> {
  return api.get<FeedbackDetail>(`/feedback/mine/${encodeURIComponent(ticketId)}`);
}
