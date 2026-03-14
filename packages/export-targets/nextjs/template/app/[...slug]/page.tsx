import { notFound } from "next/navigation";

import { resolveArtifactByPath } from "@/src/lib/published-contract";
import { renderComponentTree } from "@/src/lib/component-registry";

type PageProps = {
  params: Promise<{ slug?: string[] }>;
};

function toPath(slug: string[] | undefined): string {
  if (!slug || slug.length === 0) {
    return "/";
  }
  return `/${slug.join("/")}`;
}

export default async function CatchAllPage({ params }: PageProps) {
  const resolved = await params;
  const artifact = resolveArtifactByPath(toPath(resolved.slug));
  if (!artifact) {
    notFound();
  }
  return renderComponentTree(artifact);
}
