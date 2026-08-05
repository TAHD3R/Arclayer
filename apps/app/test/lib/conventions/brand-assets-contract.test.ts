import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const PUBLIC_DIR = path.resolve(import.meta.dirname, "../../../public");
const BRAND_ASSETS = ["logo.svg", "logo-dark.svg", "logo-full.svg", "logo-full-dark.svg"];

async function readBrandAssets() {
  return Promise.all(
    BRAND_ASSETS.map(
      async (filename) =>
        [filename, await fs.readFile(path.join(PUBLIC_DIR, filename), "utf-8")] as const,
    ),
  );
}

describe("Arclayer brand assets", () => {
  it("ships only the Arc Stone geometry without the former Airtable palette", async () => {
    const assets = await readBrandAssets();

    for (const [filename, svg] of assets) {
      expect(svg, filename).toContain("Arclayer");
      expect(svg, filename).not.toMatch(
        /Airtable|palette-(?:yellow|cyan|red)|#f5c83b|#18c7d8|#f75f6b/i,
      );
    }
  });

  it("keeps the full wordmarks as portable vector outlines", async () => {
    const assets = new Map(await readBrandAssets());

    for (const filename of ["logo-full.svg", "logo-full-dark.svg"]) {
      const svg = assets.get(filename) ?? "";
      expect(svg).toContain('viewBox="0 0 378 112"');
      expect(svg).toContain('data-font-weight="700"');
      expect(svg).toContain('data-wordmark-customization="A-r-y"');
      expect(svg.match(/data-custom-glyph=/g)).toHaveLength(4);
      expect(svg).not.toContain("<text");
      expect(svg.match(/<path/g)).toHaveLength(9);
    }
  });

  it("composites four interlocking arc pieces through one continuous material mask", async () => {
    const assets = await readBrandAssets();

    for (const [filename, svg] of assets) {
      expect(svg, filename).toContain('viewBox="8 8 240 240"');
      expect(svg, filename).toContain('<path id="arc-piece"');
      expect(svg.match(/<use href="#arc-piece"/g), filename).toHaveLength(4);
      expect(svg, filename).toContain('<mask id="arc-weave-mask"');
      expect(svg.match(/mask="url\(#arc-weave-mask\)"/g), filename).toHaveLength(1);
      expect(svg.match(/gradientUnits="userSpaceOnUse"/g), filename).toHaveLength(5);
      expect(svg.match(/mix-blend-mode:multiply/g), filename).toHaveLength(2);
      expect(svg, filename).not.toContain("<filter");
      expect(svg, filename).not.toContain("fill-rule");
    }
  });

  it("uses the approved graphite and soft-pearl material profiles", async () => {
    const assets = new Map(await readBrandAssets());

    for (const filename of ["logo.svg", "logo-full.svg"]) {
      const svg = assets.get(filename) ?? "";
      expect(svg, filename).toContain('id="graphite-base"');
      expect(svg, filename).not.toContain('id="pearl-base"');
    }

    for (const filename of ["logo-dark.svg", "logo-full-dark.svg"]) {
      const svg = assets.get(filename) ?? "";
      expect(svg, filename).toContain('id="pearl-base"');
      expect(svg, filename).not.toContain('id="graphite-base"');
    }
  });

  it("uses a lighter optical profile for the mark on dark surfaces", async () => {
    const assets = new Map(await readBrandAssets());

    expect(assets.get("logo-dark.svg")).toContain('data-optical-compensation="dark"');
    expect(assets.get("logo-full-dark.svg")).toContain('data-optical-compensation="dark"');
    expect(assets.get("logo.svg")).not.toContain("data-optical-compensation");
    expect(assets.get("logo-full.svg")).not.toContain("data-optical-compensation");
  });
});
