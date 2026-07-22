import type { SystemConnectorDefinition, SystemPlugin } from "@/api/plugins";

export type EmailProviderField = {
  name: string;
  labelKey: string;
  descriptionKey: string | null;
  defaultValue: string;
  placeholder: string | null;
  format: string | null;
  required: boolean;
  secret: boolean;
};

export type EmailProviderDefinition = {
  providerId: string;
  labelKey: string;
  descriptionKey: string | null;
  fields: readonly EmailProviderField[];
  builtIn: boolean;
};

export const SMTP_PROVIDER_DEFINITION: EmailProviderDefinition = {
  providerId: "smtp",
  labelKey: "settings:SETTINGS_MESSAGING_MAIL_PROVIDER_SMTP",
  descriptionKey: "settings:SETTINGS_MESSAGING_MAIL_CONFIG_SHEET_DESC",
  fields: [],
  builtIn: true,
};

function readString(input: Record<string, unknown>, key: string): string | null {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toField(name: string, schema: unknown, secret: boolean): EmailProviderField | null {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return null;
  const input = schema as Record<string, unknown>;
  if (input.type !== "string") return null;
  return {
    name,
    labelKey: readString(input, "title") ?? name,
    descriptionKey: readString(input, "description"),
    defaultValue: readString(input, "default") ?? "",
    placeholder: readString(input, "placeholder"),
    format: readString(input, "format"),
    required: input["x-required"] === true,
    secret,
  };
}

function schemaFields(schema: Record<string, unknown>, secret: boolean): EmailProviderField[] {
  return Object.entries(schema).flatMap(([name, value]) => {
    const field = toField(name, value, secret);
    return field ? [field] : [];
  });
}

function toEmailProvider(definition: SystemConnectorDefinition): EmailProviderDefinition | null {
  if (definition.kind !== "email" || !definition.key.startsWith("email.")) return null;
  const providerId = definition.key.slice("email.".length).trim();
  if (!providerId || !definition.admin) return null;
  return {
    providerId,
    labelKey: definition.admin.labelKey,
    descriptionKey: definition.admin.descriptionKey,
    fields: [
      ...schemaFields(definition.configSchema, false),
      ...schemaFields(definition.secretSchema, true),
    ],
    builtIn: false,
  };
}

export function resolveEmailProviderDefinitions(
  plugins: readonly SystemPlugin[],
): EmailProviderDefinition[] {
  const providers = plugins.flatMap((plugin) =>
    plugin.connectorDefinitions.flatMap((definition) => {
      const provider = toEmailProvider(definition);
      return provider ? [provider] : [];
    }),
  );
  const uniqueProviders = new Map(providers.map((provider) => [provider.providerId, provider]));
  return [SMTP_PROVIDER_DEFINITION, ...uniqueProviders.values()];
}

export function findEmailProviderDefinition(
  definitions: readonly EmailProviderDefinition[],
  providerId: string,
): EmailProviderDefinition | null {
  return definitions.find((definition) => definition.providerId === providerId) ?? null;
}
