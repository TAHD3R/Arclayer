import type {
  FeedbackCategory,
  FeedbackContextType,
  FeedbackPriority,
  FeedbackSource,
  FeedbackStatus,
} from "@/api/feedback";

export const FEEDBACK_CATEGORIES: readonly FeedbackCategory[] = [
  "bug",
  "feature_request",
  "usability",
  "performance",
  "billing",
  "other",
];
export const FEEDBACK_STATUSES: readonly FeedbackStatus[] = [
  "new",
  "triaged",
  "in_progress",
  "waiting_for_customer",
  "resolved",
  "closed",
];
export const FEEDBACK_PRIORITIES: readonly FeedbackPriority[] = ["low", "normal", "high", "urgent"];
export const FEEDBACK_SOURCES: readonly FeedbackSource[] = [
  "header",
  "ai_sidebar",
  "feedback_center",
];

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "CATEGORY_BUG",
  feature_request: "CATEGORY_FEATURE_REQUEST",
  usability: "CATEGORY_USABILITY",
  performance: "CATEGORY_PERFORMANCE",
  billing: "CATEGORY_BILLING",
  other: "CATEGORY_OTHER",
};
export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "STATUS_NEW",
  triaged: "STATUS_TRIAGED",
  in_progress: "STATUS_IN_PROGRESS",
  waiting_for_customer: "STATUS_WAITING_FOR_CUSTOMER",
  resolved: "STATUS_RESOLVED",
  closed: "STATUS_CLOSED",
};
export const FEEDBACK_PRIORITY_LABELS: Record<FeedbackPriority, string> = {
  low: "PRIORITY_LOW",
  normal: "PRIORITY_NORMAL",
  high: "PRIORITY_HIGH",
  urgent: "PRIORITY_URGENT",
};
export const FEEDBACK_SOURCE_LABELS: Record<FeedbackSource, string> = {
  header: "SOURCE_HEADER",
  ai_sidebar: "SOURCE_AI_SIDEBAR",
  feedback_center: "SOURCE_FEEDBACK_CENTER",
};
export const FEEDBACK_CONTEXT_LABELS: Record<FeedbackContextType, string> = {
  global: "CONTEXT_GLOBAL",
  workspace: "CONTEXT_WORKSPACE",
  project: "CONTEXT_PROJECT",
  ai_conversation: "CONTEXT_AI_CONVERSATION",
};
