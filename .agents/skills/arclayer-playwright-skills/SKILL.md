---
name: arclayer-playwright-skills
description: Debug and verify Arclayer frontend behavior with Playwright MCP, especially Admin at http://localhost:5173/. Use when the user asks to call Playwright MCP, interactively test Admin UI, log in or register a test account, inject a user-provided Bearer token, verify layout or visual behavior, inspect console or network failures, reproduce frontend regressions, test responsive states, or validate design-sensitive changes against DESIGN.md.
---

# Arclayer Playwright Skills

## Core Contract

Use Playwright MCP as the live browser evidence path for Arclayer frontend work.

- Default base URL: `http://localhost:5173/`.
- Default surface: `apps/admin`.
- Primary design source: `DESIGN.md`.
- Admin implementation source: `docs/guidelines/frontend-design.md`.
- Default test account email: `codex@example.com`.
- Runtime password source: the user-provided password in the active conversation. Use it only in browser fields or API payloads; do not write it to files, logs, screenshots, or reports.
- Interaction source: accessibility snapshot refs from Playwright MCP.
- Visual evidence source: screenshots, viewport checks, computed styles, console logs, and network requests.
- Screenshot output directory: `.playwright-mcp/screenshots/`. Never save Playwright screenshots in the repository root.

When the user asks to use Playwright MCP, actually use the Playwright MCP tools. Do not replace live browser testing with code inspection.

## Preflight

1. Read `AGENTS.md` and confirm this skill applies to the current task.
2. Read the relevant `DESIGN.md` sections for the visual behavior under test.
3. Identify the route path, expected user action, expected visual result, and target viewport.
4. Navigate with `browser_navigate` to `http://localhost:5173/` or the requested route.
5. If the dev server is unreachable, report that exact blocker. Start or restart dev servers only when the user requested it.
6. If the page redirects to login or lacks a session, use the authentication workflow below before testing protected Admin routes.

## Authentication Workflow

Prefer real login through the Admin UI.

1. Navigate to `http://localhost:5173/login`.
2. Use `browser_snapshot` to identify the email, password, remember-session, submit, and register controls.
3. Log in with `codex@example.com` and the runtime password supplied by the user.
4. If login reports that the account does not exist, register it through the UI using:
   - email: `codex@example.com`
   - username: `codex`
   - display name: `Codex Debug`
   - password: the runtime password supplied by the user
5. After registration, log in again with the same email and runtime password.
6. If login requires 2FA, email verification, bootstrap setup, or any other external step, stop and report the blocker.

The Admin API paths behind this flow are `/api/v1/auth/login` and `/api/v1/auth/register` when the Vite proxy is active. Use browser UI first so local auth state, cookies, redirects, and app behavior match a real user session.

## Bearer Token Workflow

If the logged-in account lacks permission, stop and report the missing permission or blocked route. Ask the user to provide a Bearer Token for an account with the needed permission.

When the user provides a Bearer Token, use it without printing it back. For Admin UI testing, inject it into the persisted auth store and reload:

```js
localStorage.setItem(
  "arclayer:admin:auth",
  JSON.stringify({
    state: {
      keepSession: true,
      accessToken: "<BEARER_TOKEN>",
      refreshToken: null,
      tokenType: "bearer",
      expiresIn: null,
      refreshExpiresIn: null
    },
    version: 1
  })
);
location.reload();
```

Use `browser_evaluate` for the injection. Replace `<BEARER_TOKEN>` with the user-provided token inside the evaluated function. Do not read back, log, screenshot, or include the token in the final report.

For direct API checks from the browser context, pass `Authorization: Bearer <token>` in the request header. Prefer UI verification after localStorage injection when the task is about Admin behavior.

## Browser Workflow

Use this sequence for every interactive Admin check:

1. `browser_navigate` to the target URL.
2. `browser_snapshot` to get accessible structure and stable refs.
3. Use `browser_click`, `browser_type`, `browser_fill_form`, `browser_select_option`, or `browser_press_key` with snapshot refs.
4. Use `browser_wait_for` only for a concrete UI text, disappearance, or short stabilization pause.
5. Use `browser_console_messages` at `warning` or `error` level after reproduction.
6. Use `browser_network_requests` for API failures, filtered when a specific endpoint matters.
7. Use `browser_take_screenshot` for design, layout, responsive, or visual regression evidence. Set `filename` to `.playwright-mcp/screenshots/<descriptive-name>.png`.

Prefer `browser_snapshot` over screenshots for deciding what to click. Use screenshots to verify visual results.

## Debug Workflow

1. Reproduce the exact issue before editing code.
2. Record the route, viewport, action sequence, actual result, and expected result.
3. Gather console errors and relevant network requests.
4. For layout or styling issues, inspect computed layout with `browser_evaluate` on the target element when the snapshot or screenshot is insufficient.
5. Compare the result against `DESIGN.md` and `docs/guidelines/frontend-design.md`.
6. Fix the root cause in the code only after the live symptom and likely owner are clear.
7. Re-run the same Playwright MCP steps after the fix.

## Viewports

Use the smallest viewport set that proves the claim:

- Desktop Admin default: `1440x900`.
- Narrow desktop or split-pane risk: `1024x768`.
- Mobile sheet or responsive behavior: `390x844`.

For responsive bugs, call `browser_resize` before navigating or before the interaction being tested, then capture a fresh snapshot and screenshot under `.playwright-mcp/screenshots/`.

## Design Readback

For design-sensitive checks, explicitly compare the page against `DESIGN.md`:

- White canvas in light mode, true black plus charcoal in dark mode.
- Blue only for action, selection, and links.
- Poppins for hierarchy; Figtree for dense work.
- Compact readable spacing; reduce spacing before shrinking text.
- Borders and surfaces create hierarchy before decorative effects.
- Motion confirms orientation and state; it never steals attention.
- Copy is direct, calm, concise, and user-facing.

Flag drift when the UI uses decorative card farms, nested cards without structural purpose, blue atmosphere, gradient-first decoration, cinematic shadows, tiny dense text, unclear focus, or engineering-status copy.

## Evidence Report

When reporting Playwright MCP results, include:

- URL and viewport.
- Reproduction steps.
- Authentication path used: existing session, UI login, UI registration then login, or user-provided Bearer Token.
- Observed result.
- Console errors or relevant warnings.
- Relevant failed or suspicious network requests.
- Screenshot path under `.playwright-mcp/screenshots/` when captured.
- `DESIGN.md` rule readback for visual claims.
- Verification boundary if runtime, auth, or data blocked part of the test.

Do not claim a UI path was tested unless the browser reached that path and the interaction was executed.
