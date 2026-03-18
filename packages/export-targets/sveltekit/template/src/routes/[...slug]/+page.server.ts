import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
  const path = "/" + (params.slug ?? "");

  return {
    path,
  };
};
