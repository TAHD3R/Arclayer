type RouteParams = {
  slug?: string[];
};

type RouteContext = {
  params: Promise<RouteParams>;
};

export default async function CatchAllPage({ params }: RouteContext) {
  const resolved = await params;
  const path = "/" + (resolved.slug ?? []).join("/");

  return (
    <main>
      <h1>Arclayer Export</h1>
      <p>Resolve publish-contract data for: {path === "/" ? "/" : path}</p>
    </main>
  );
}
