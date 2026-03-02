import { createLazyFileRoute } from "@tanstack/react-router";

import { RepairMasterKeyPage } from "@/pages/repair-master-key/page";

export const Route = createLazyFileRoute("/repair/master-key/")({
  component: RepairMasterKeyPage,
});
