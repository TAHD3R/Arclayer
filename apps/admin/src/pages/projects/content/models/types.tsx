import type { CreateAdminContentModelPayload } from "@/types/api";

export type ContentTypeIdentifierSource = "generated" | "manual";

export type ContentTypeIdentifierState = {
  value: string;
  source: ContentTypeIdentifierSource;
};

export type CreateContentTypeFormValues = {
  name: string;
  singularKey: ContentTypeIdentifierState;
  pluralKey: ContentTypeIdentifierState;
  description: string;
};

export type CreateContentTypeSubmitValues = {
  name: string;
  singularKey: string;
  pluralKey: string;
  description: string | null;
  payload: CreateAdminContentModelPayload;
};
