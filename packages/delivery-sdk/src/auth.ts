import type { DeliveryPerspective, DeliverySdkOptions, GraphQLPerspective } from "./types";

const TRACE_HEADER_NAME = "X-Trace-Id";

export const normalizeDeliveryBaseUrl = (value: string): string => value.replace(/\/+$/, "");

const resolveDeliveryKey = async (
  deliveryKey: DeliverySdkOptions["deliveryKey"],
): Promise<string | null> => {
  if (typeof deliveryKey === "function") {
    return (await deliveryKey())?.trim() || null;
  }
  return deliveryKey?.trim() || null;
};

export const createDeliveryHeaders = async (
  options: DeliverySdkOptions,
  extra?: HeadersInit,
): Promise<Headers> => {
  const headers = new Headers(options.headers);
  if (extra) {
    new Headers(extra).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  const deliveryKey = await resolveDeliveryKey(options.deliveryKey);
  if (deliveryKey) {
    headers.set("Authorization", `Bearer ${deliveryKey}`);
    headers.set("X-API-Key", deliveryKey);
  }

  return headers;
};

export const readDeliveryRequestId = (response: Response): string | null =>
  response.headers.get(TRACE_HEADER_NAME) ?? response.headers.get(TRACE_HEADER_NAME.toLowerCase());

export const toGraphqlPerspective = (value: DeliveryPerspective): GraphQLPerspective =>
  value === "preview" ? "PREVIEW" : "PUBLISHED";
