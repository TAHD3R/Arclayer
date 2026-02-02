import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DocumentRenderer } from "@celestial/site-renderer-core";

import { getHardcodedDocument } from "@/runtime/hardcoded-document";
import { HydrationStatus } from "@/components/HydrationStatus";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage() {
  const doc = getHardcodedDocument();

  return (
    <>
      <HydrationStatus />
      <DocumentRenderer document={doc} ctx={{ locale: "zh-CN", fallbackLocale: "en-US" }} />
    </>
  );
}
