export type PresignedUploadPart = {
  url: string;
  method?: string | null;
  headers?: Record<string, string> | null;
};

export async function uploadPresignedPart(params: {
  presign: PresignedUploadPart;
  chunk: Blob;
  signal?: AbortSignal;
  errorMessage: string;
  missingEtagMessage: string;
}): Promise<string> {
  const response = await fetch(params.presign.url, {
    method: params.presign.method || "PUT",
    headers: params.presign.headers || {},
    body: params.chunk,
    signal: params.signal,
  });
  if (!response.ok) throw new Error(params.errorMessage);
  const etag = response.headers.get("etag") || response.headers.get("ETag");
  if (!etag) throw new Error(params.missingEtagMessage);
  return etag;
}

export async function fetchAssetBlob(params: {
  url: string;
  headers?: HeadersInit;
  credentials?: RequestCredentials;
  signal?: AbortSignal;
}): Promise<Blob> {
  const response = await fetch(params.url, {
    headers: params.headers,
    credentials: params.credentials,
    signal: params.signal,
  });
  if (!response.ok) throw new Error(`asset fetch failed: ${response.status}`);
  return response.blob();
}

export async function fetchAssetText(params: {
  url: string;
  headers?: HeadersInit;
  credentials?: RequestCredentials;
}): Promise<string> {
  const response = await fetch(params.url, {
    headers: params.headers,
    credentials: params.credentials,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}
