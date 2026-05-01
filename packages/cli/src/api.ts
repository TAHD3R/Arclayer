import { CliError } from "./errors.js";

type SettingsNamespaceSummary = {
  readonly namespace: string;
};

type PageDataSettingsNamespaceSummary = {
  readonly items?: readonly SettingsNamespaceSummary[];
  readonly next?: number | null;
};

type SettingsDetail = {
  readonly namespace: string;
  readonly value?: Record<string, unknown>;
};

export type ConfigDumpNamespace = {
  readonly namespace: string;
  readonly value: Record<string, unknown>;
};

export type ConfigDump = {
  readonly format: "arclayer.config.dump";
  readonly version: 1;
  readonly exportedAt: string;
  readonly namespaces: readonly ConfigDumpNamespace[];
};

export type CliApi = {
  dumpConfig: (options: { pageSize: number }) => Promise<ConfigDump>;
  restoreConfig: (dump: ConfigDump) => Promise<readonly string[]>;
};

type ApiEnvelope<TData> = {
  readonly data?: TData | null;
  readonly error?: unknown;
  readonly message?: string;
};

export function createHttpCliApi(options: {
  apiUrl: string;
  token: string;
  fetch?: typeof fetch;
}): CliApi {
  const request = createJsonRequest(options);

  return {
    dumpConfig: async ({ pageSize }) => {
      const loadNamespaceNames = async (page: number): Promise<string[]> => {
        const response = await request<PageDataSettingsNamespaceSummary>(
          `/api/v1/system/settings?page=${page}&size=${pageSize}`,
        );
        const pageData = unwrapEnvelopeData<PageDataSettingsNamespaceSummary>(
          response,
          "config namespace list",
        );
        const currentNames = (pageData.items ?? []).map((item) => item.namespace);
        if (pageData.next === null || pageData.next === undefined) {
          return currentNames;
        }
        return [...currentNames, ...(await loadNamespaceNames(pageData.next))];
      };

      const namespaceNames = await loadNamespaceNames(1);
      const namespaces = await Promise.all(
        namespaceNames.map(async (namespace): Promise<ConfigDumpNamespace> => {
          const response = await request<SettingsDetail>(
            `/api/v1/system/settings/${encodeURIComponent(namespace)}`,
          );
          const detail = unwrapEnvelopeData<SettingsDetail>(
            response,
            `config namespace ${namespace}`,
          );
          return {
            namespace: detail.namespace,
            value: detail.value ?? {},
          };
        }),
      );

      return {
        exportedAt: new Date().toISOString(),
        format: "arclayer.config.dump",
        namespaces,
        version: 1,
      };
    },
    restoreConfig: async (dump) => {
      const restored = await Promise.all(
        dump.namespaces.map(async (namespace): Promise<string> => {
          await request<SettingsDetail>(
            `/api/v1/system/settings/${encodeURIComponent(namespace.namespace)}`,
            {
              body: JSON.stringify({ patch: namespace.value }),
              method: "PATCH",
            },
          );
          return namespace.namespace;
        }),
      );
      return restored;
    },
  };
}

function createJsonRequest(options: {
  apiUrl: string;
  token: string;
  fetch?: typeof fetch;
}): <TData>(path: string, init?: RequestInit) => Promise<ApiEnvelope<TData>> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (fetchImpl === undefined) {
    throw new CliError("Fetch API is unavailable in this runtime");
  }

  return async function request<TData>(
    path: string,
    init: RequestInit = {},
  ): Promise<ApiEnvelope<TData>> {
    const url = new URL(path, normalizeBaseUrl(options.apiUrl));
    const response = await fetchImpl(url, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${options.token}`,
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...init.headers,
      },
    });
    const payload = (await response.json()) as ApiEnvelope<TData>;
    if (!response.ok) {
      throw new CliError(
        `Request failed (${response.status}): ${formatApiError(payload.error ?? payload)}`,
      );
    }
    return payload;
  };
}

function normalizeBaseUrl(apiUrl: string): string {
  return apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
}

function unwrapEnvelopeData<TData>(
  envelope: { data?: TData | null; error?: unknown },
  label: string,
): TData {
  if (envelope.error !== undefined && envelope.error !== null) {
    throw new CliError(`Failed to read ${label}: ${formatApiError(envelope.error)}`);
  }
  if (envelope.data === undefined || envelope.data === null) {
    throw new CliError(`Failed to read ${label}: empty API response data`);
  }
  return envelope.data as TData;
}

function formatApiError(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim() !== "") {
      return message;
    }
  }
  return JSON.stringify(error);
}

export function parseConfigDump(value: unknown): ConfigDump {
  if (typeof value !== "object" || value === null) {
    throw new CliError("Config dump must be a JSON object");
  }
  const dump = value as Partial<ConfigDump>;
  if (dump.format !== "arclayer.config.dump" || dump.version !== 1) {
    throw new CliError("Unsupported config dump format");
  }
  if (!Array.isArray(dump.namespaces)) {
    throw new CliError("Config dump must include namespaces");
  }
  for (const namespace of dump.namespaces) {
    if (
      typeof namespace !== "object" ||
      namespace === null ||
      typeof namespace.namespace !== "string" ||
      typeof namespace.value !== "object" ||
      namespace.value === null
    ) {
      throw new CliError("Config dump contains an invalid namespace entry");
    }
  }
  return dump as ConfigDump;
}

export type SettingsDetailValue = SettingsDetail["value"];
