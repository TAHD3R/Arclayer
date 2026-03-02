# Portal Fonts (Sprint 1)

This directory is reserved for self-hosted font files.

Sprint 1 goal is to validate the SSR injection pipeline (not to ship a real font).

How to test locally

1. Drop a `.woff2` file here, e.g. `apps/web/portal/public/fonts/demo.woff2`
2. Update `apps/web/portal/src/runtime/runtime-config.ts` to add an entry under `fonts`
3. Ensure `--font-sans` includes the configured `family`
4. Start portal dev server and check the generated `<style id="portal-font-faces">...`
