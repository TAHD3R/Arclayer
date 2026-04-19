import graphqlManifest from "../../../apps/api/src/modules/sites/graphql/artifacts/v1/manifest.json";

export interface GraphQLManifestQueryInput {
  fields: string[];
  name: string;
}

export interface GraphQLManifestFieldDefinition {
  fieldName: string;
  required: boolean;
  scalar: "String" | "Int" | "Float" | "Boolean" | "JSON";
  sourceKey: string;
}

export interface GraphQLManifestModelDefinition {
  customFieldsContainer: string;
  entryType: string;
  filterInput: GraphQLManifestQueryInput;
  listQueryName: string;
  modelKey: string;
  sdkDataType: string;
  sdkVariablesType: string;
  singleQueryArgument: string;
  singleQueryName: string;
  sortInput: GraphQLManifestQueryInput;
  systemFields: GraphQLManifestFieldDefinition[];
}

export interface GraphQLManifestHookDefinition {
  description: string;
  modelKeys: string[];
  name: string;
  phase: string;
}

export interface GraphQLManifestSubscriptionEventDefinition {
  description: string;
  name: string;
  payloadFields: string[];
  topic: string;
}

export interface GraphQLSchemaManifest {
  artifactVersion: string;
  hooks: {
    queryPostProcessors: GraphQLManifestHookDefinition[];
    schemaFieldProviders: GraphQLManifestHookDefinition[];
  };
  perspectives: Array<"published" | "preview">;
  queryMode: "read-only";
  registry: {
    models: GraphQLManifestModelDefinition[];
  };
  schemaFamily: string;
  schemaFile: string;
  sha256: string;
  subscriptions: {
    events: GraphQLManifestSubscriptionEventDefinition[];
    mode: "contract-only";
    runtime: "deferred";
  };
}

const manifest = graphqlManifest as GraphQLSchemaManifest;

const modelMap = new Map(manifest.registry.models.map((model) => [model.modelKey, model]));
const listQueryMap = new Map(manifest.registry.models.map((model) => [model.listQueryName, model]));
const singleQueryMap = new Map(
  manifest.registry.models.map((model) => [model.singleQueryName, model]),
);

export const deliveryGraphqlManifest = manifest;

export const getDeliveryGraphqlManifest = (): GraphQLSchemaManifest => manifest;

export const listDeliveryGraphqlModels = (): GraphQLManifestModelDefinition[] => [
  ...manifest.registry.models,
];

export const getDeliveryGraphqlModel = (
  modelKey: string,
): GraphQLManifestModelDefinition | undefined => modelMap.get(modelKey);

export const getDeliveryGraphqlListQueryContract = (
  queryName: string,
): GraphQLManifestModelDefinition | undefined => listQueryMap.get(queryName);

export const getDeliveryGraphqlSingleQueryContract = (
  queryName: string,
): GraphQLManifestModelDefinition | undefined => singleQueryMap.get(queryName);

export const listDeliveryGraphqlSubscriptionEvents =
  (): GraphQLManifestSubscriptionEventDefinition[] => [...manifest.subscriptions.events];
