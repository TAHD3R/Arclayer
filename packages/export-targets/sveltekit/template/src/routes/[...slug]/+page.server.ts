import { error } from "@sveltejs/kit";

import { resolveArtifactByPath } from "$lib/published-contract";

function toPath(params: { slug?: string }): string {
  if (!params.slug) {
    return "/";
  }
  return `/${params.slug}`;
}

export async function load({ params }) {
  const artifact = resolveArtifactByPath(toPath(params));
  if (!artifact) {
    throw error(404, "Published artifact not found");
  }
  return { artifact };
}
