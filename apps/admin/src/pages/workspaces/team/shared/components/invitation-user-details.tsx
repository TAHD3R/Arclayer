import type { UserIdentityMetaItem } from "./user-identity-meta";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

type DateTimeFormatterLike = {
  formatDate: (
    iso: string | null | undefined,
    options?: { emptyValue?: string; invalidValue?: string },
  ) => string;
  formatDateTime: (
    iso: string | null | undefined,
    options?: { emptyValue?: string; invalidValue?: string },
  ) => string;
};

type InvitationDetailField = {
  key: string;
  label: string;
  value: string | null | undefined;
  omitIfEmpty?: boolean;
};

function normalizeText(value: string | null | undefined): string {
  return String(value || "").trim();
}

function buildDetailItem(field: InvitationDetailField): UserIdentityMetaItem | null {
  const value = normalizeText(field.value);
  if (!value && field.omitIfEmpty) {
    return null;
  }

  return {
    key: field.key,
    label: field.label,
    value,
  };
}

export function buildInvitationUserDetails(props: {
  t: TranslateFn;
  dateTime: DateTimeFormatterLike;
  inviteeEmail?: string | null;
  createdAt?: string | null;
  expiresAt?: string | null;
  processedAt?: string | null;
  processedAtLabel?: string | null;
  lastUsedAt?: string | null;
  lastUsedAtLabel?: string | null;
}) {
  const createdText = props.dateTime.formatDateTime(props.createdAt, {
    emptyValue: props.t("common:NA"),
  });
  const expiresText = props.expiresAt
    ? props.dateTime.formatDateTime(props.expiresAt, { emptyValue: props.t("common:NA") })
    : props.t("team:TEAM_INVITATIONS_NEVER_EXPIRES");
  const processedText = props.processedAt
    ? props.dateTime.formatDateTime(props.processedAt, { emptyValue: props.t("common:NA") })
    : "";
  const lastUsedText = props.lastUsedAt
    ? props.dateTime.formatDateTime(props.lastUsedAt, { emptyValue: props.t("common:NA") })
    : "";

  return [
    buildDetailItem({
      key: "email",
      label: props.t("team:TEAM_INVITATIONS_COL_EMAIL"),
      value: props.inviteeEmail,
      omitIfEmpty: true,
    }),
    buildDetailItem({
      key: "createdAt",
      label: props.t("team:TEAM_INVITATIONS_COL_CREATED"),
      value: createdText,
    }),
    buildDetailItem({
      key: "expiresAt",
      label: props.t("team:TEAM_INVITATIONS_COL_EXPIRES"),
      value: expiresText,
    }),
    buildDetailItem({
      key: "processedAt",
      label: props.processedAtLabel || "",
      value: processedText,
      omitIfEmpty: true,
    }),
    buildDetailItem({
      key: "lastUsedAt",
      label: props.lastUsedAtLabel || "",
      value: lastUsedText,
      omitIfEmpty: true,
    }),
  ].filter((item): item is UserIdentityMetaItem => Boolean(item));
}
