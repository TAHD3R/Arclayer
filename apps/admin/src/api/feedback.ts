import { api } from "@/lib/http";
import type { FeedbackDetail, SubmitFeedbackPayload } from "@arclayer/openapi/admin-types";

export type {
  FeedbackContextType,
  FeedbackDetail,
  FeedbackIntent,
  FeedbackSource,
  SubmitFeedbackPayload,
} from "@arclayer/openapi/admin-types";

export async function submitFeedback(payload: SubmitFeedbackPayload): Promise<FeedbackDetail> {
  return api.post<FeedbackDetail>("/feedback", payload);
}
