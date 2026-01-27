import { createFileRoute } from "@tanstack/react-router";

import { TestLevel3View } from "@/views/TestLevel3View";

export const Route = createFileRoute("/test/level2/level3")({
  component: TestLevel3View,
});
