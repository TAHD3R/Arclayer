import { createFileRoute } from "@tanstack/react-router";

import { TestLevel2View } from "@/views/TestLevel2View";

export const Route = createFileRoute("/test/level-2/")({
  component: TestLevel2View,
});
