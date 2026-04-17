import { createDeliverySdk } from "../src";

const sdk = createDeliverySdk({
  baseUrl: "https://api.arclayer.test",
  deliveryKey: () => process.env.ARCLAYER_DELIVERY_KEY,
});

async function run() {
  const page = await sdk.pages.resolve({
    path: "/blog/hello-world",
    perspective: "published",
    siteId: "site_public_id",
  });

  const article = await sdk.content.articleBySlug({
    perspective: "published",
    siteId: "site_public_id",
    slug: "hello-world",
  });

  console.log(page.data.match.kind, article.data.articleBySlug?.title);
}

void run();
