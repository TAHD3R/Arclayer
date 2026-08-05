import type {
  ContentModelOut,
  ContentModelDefinitionContract as CreateAdminContentModelPayload,
} from "@arclayer/openapi";
import type { listAllContentModels } from "@/api/content";

type AdminContentModel = Awaited<ReturnType<typeof listAllContentModels>>[number];
type AdminContentModelCategory = ContentModelOut["category"];
type AdminContentModelKind = NonNullable<ContentModelOut["modelKind"]>;

export type ContentModelsTableRow = AdminContentModel;

export type ContentModelsFilters = {
  category?: AdminContentModelCategory;
  modelKind?: AdminContentModelKind;
  systemManaged?: "yes" | "no";
};

export type ContentModelsTableQuery = {
  category?: AdminContentModelCategory;
  model_kind?: AdminContentModelKind;
  system_managed?: boolean;
};

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
  modelKind: AdminContentModelKind;
};

export type CreateContentTypeSubmitValues = {
  name: string;
  singularKey: string;
  pluralKey: string;
  description: string | null;
  payload: CreateAdminContentModelPayload;
};
