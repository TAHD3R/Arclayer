import React from "react";
import ReactDOMServer from "react-dom/server";
import { escapeInject, dangerouslySkipEscape } from "vike/server";

import { PageShell } from "./PageShell";
import { createPortalRouter } from "@/router";
import { getPortalRuntimeConfig } from "@/runtime/runtime-config";
import { serializeCssVarsToStyleText } from "@celestial/site-renderer-core";

export { onRenderHtml };

async function onRenderHtml(pageContext: { urlOriginal: string }) {
  const router = createPortalRouter({
    kind: "server",
    url: pageContext.urlOriginal,
  });

  await router.load();

  const runtimeConfig = getPortalRuntimeConfig();
  const cssVarStyleText = serializeCssVarsToStyleText(runtimeConfig.theme.cssVars);

  const appHtml = ReactDOMServer.renderToString(<PageShell router={router} />);

  const documentHtml = escapeInject`<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style id="portal-css-vars">${cssVarStyleText}</style>
      </head>
      <body>
        <div id="page-view">${dangerouslySkipEscape(appHtml)}</div>
      </body>
    </html>`;

  return {
    documentHtml,
  };
}
