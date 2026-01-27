import { createFileRoute } from "@tanstack/react-router";

import { TestView } from "@/views/TestView";

export const Route = createFileRoute("/test")({
  component: TestView,
});
