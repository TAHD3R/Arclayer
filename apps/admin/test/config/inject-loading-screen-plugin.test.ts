import { describe, expect, it } from "vitest";

import { injectLoadingScreen } from "@arclayer/vite-plugin";

type InjectedHtmlTag = {
  tag: string;
  attrs?: Record<string, string>;
  children?: string;
  injectTo?: "head" | "body" | "body-prepend";
};

function callIndexHtmlHook(plugin: { transformIndexHtml?: unknown }): InjectedHtmlTag[] {
  const hook = plugin.transformIndexHtml;
  if (typeof hook === "function") {
    return (hook as () => InjectedHtmlTag[])();
  }
  if (typeof hook === "object" && hook !== null && "handler" in hook) {
    return (hook as { handler: () => InjectedHtmlTag[] }).handler();
  }
  throw new Error("injectLoadingScreen must expose a transformIndexHtml hook");
}

describe("injectLoadingScreen", () => {
  it("injects the reference-style Arc Weave particle runtime", () => {
    const tags = callIndexHtmlHook(injectLoadingScreen({ appName: "Arclayer" }));
    const loadingScreen = tags.find((tag) => tag.attrs?.id === "app-loading");
    const runtimeTag = tags.find((tag) => tag.tag === "script");
    const runtime = runtimeTag?.children;

    expect(loadingScreen?.injectTo).toBe("body-prepend");
    expect(runtimeTag?.injectTo).toBe("body");
    expect(loadingScreen?.children).toContain('class="arc-weave-loader"');
    expect(loadingScreen?.children).not.toContain('class="spinner"');
    expect(loadingScreen?.children?.match(/data-arc-weave-particle/g)).toHaveLength(64);
    expect(loadingScreen?.children).not.toContain("animateMotion");
    expect(runtime).toContain("window.requestAnimationFrame(tick)");
    expect(runtime).toContain('path.setAttribute("d", buildPath(detailScale))');
  });

  it("keeps a static Arc Weave trace for both reduced-motion sources", () => {
    const tags = callIndexHtmlHook(injectLoadingScreen());
    const style = tags.find((tag) => tag.attrs?.id === "app-loading-style");

    expect(style?.children).toContain('[data-motion="reduced"]');
    expect(style?.children).toContain("@media (prefers-reduced-motion: reduce)");
    expect(style?.children).toContain(".arc-weave-particles");
  });
});
