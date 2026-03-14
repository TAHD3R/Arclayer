import type { PublishedArtifact } from "@/artifact-loader";

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export function renderPublishedArtifact(artifact: PublishedArtifact): Response {
  if (artifact.kind === "json") {
    return jsonResponse(200, {
      data: artifact.payload ?? {},
      artifactKey: artifact.artifactKey,
    });
  }

  const html = artifact.html;
  if (!html) {
    return jsonResponse(500, {
      error: "PUBLISHED_ARTIFACT_INVALID",
      artifactKey: artifact.artifactKey,
      message: "Published artifact is missing HTML payload.",
    });
  }

  const headers = new Headers({
    "content-type": "text/html; charset=utf-8",
  });
  if (artifact.etag) {
    headers.set("etag", artifact.etag);
  }
  return new Response(html, { status: 200, headers });
}

export function renderMissingArtifact(artifactKey: string): Response {
  return jsonResponse(404, {
    error: "PUBLISHED_ARTIFACT_MISSING",
    artifactKey,
    message: "Publish artifact is missing for the resolved route pointer.",
  });
}

export function renderRoutePointerMissing(path: string): Response {
  return jsonResponse(404, {
    error: "ROUTE_POINTER_NOT_FOUND",
    path,
    message: "No publish route pointer for the resolved tenant route.",
  });
}

export function renderTenantMissing(): Response {
  return jsonResponse(404, {
    error: "DELIVERY_TENANT_NOT_FOUND",
    message: "No tenant matches the request host/path.",
  });
}
