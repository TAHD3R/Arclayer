import { createDeliverySdk, isDeliveryGraphQLError } from "../src";

const sdk = createDeliverySdk({
  baseUrl: "https://api.arclayer.test",
  deliveryKey: () => process.env.ARCLAYER_DELIVERY_KEY,
});

async function run() {
  try {
    const articles = await sdk.content.articleEntries({
      filter: {
        slug: "hello-world",
      },
      limit: 10,
      offset: 0,
      perspective: "published",
      runtimeId: "runtime_public_id",
      sort: {
        direction: "DESC",
        field: "REVISION",
      },
    });

    console.log(articles.data.articleEntries.map((entry) => entry.slug));
  } catch (error) {
    if (isDeliveryGraphQLError(error)) {
      console.error(error.code, error.message, error.requestId);
      console.error(error.details);
      return;
    }
    throw error;
  }
}

void run();
