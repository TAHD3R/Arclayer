import React from "react";

import "@/assets/index.css";

type PageShellProps = {
  pageContext: {
    Page: React.ComponentType<any>;
    pageProps?: Record<string, unknown>;
  };
};

export function PageShell({ pageContext }: PageShellProps) {
  const { Page, pageProps } = pageContext;
  return <Page {...pageProps} />;
}
